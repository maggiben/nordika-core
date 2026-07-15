const sendEmail = jest.fn(
  (_payload?: {
    from: string;
    to: string[];
    subject: string;
    text: string;
  }): Promise<{ id: string }> => {
    void _payload;
    return Promise.resolve({ id: 'email-1' });
  },
);

jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: sendEmail },
  })),
}));

import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { OptionalCacheService } from '../cache/optional-cache.service';
import { LocaleService } from '../i18n/locale.service';
import { EvolutionClient } from './evolution.client';
import { normalizeContactProjectIds } from './contact-project-ids';
import { MessagingService } from './messaging.service';

type LeanDoc<T> = T & {
  _id: Types.ObjectId;
  save?: () => Promise<LeanDoc<T>>;
};

function createModelMock<T extends object>() {
  const store: LeanDoc<T>[] = [];
  return {
    store,
    create: jest.fn((doc: T) => {
      const created = { ...doc, _id: new Types.ObjectId() } as LeanDoc<T>;
      created.save = () => Promise.resolve(created);
      store.push(created);
      return Promise.resolve(created);
    }),
    find: jest.fn((filter: Record<string, unknown> = {}) => ({
      sort: () => ({
        exec: () =>
          Promise.resolve(
            store.filter((item) =>
              matches(item as Record<string, unknown>, filter),
            ),
          ),
        limit: () => ({
          exec: () =>
            Promise.resolve(
              store.filter((item) =>
                matches(item as Record<string, unknown>, filter),
              ),
            ),
        }),
      }),
      exec: () =>
        Promise.resolve(
          store.filter((item) =>
            matches(item as Record<string, unknown>, filter),
          ),
        ),
    })),
    findOne: jest.fn((filter: Record<string, unknown>) => ({
      sort: () => ({
        exec: () =>
          Promise.resolve(
            store.find((item) =>
              matches(item as Record<string, unknown>, filter),
            ) ?? null,
          ),
      }),
      exec: () =>
        Promise.resolve(
          store.find((item) =>
            matches(item as Record<string, unknown>, filter),
          ) ?? null,
        ),
    })),
    findById: jest.fn((id: Types.ObjectId) => ({
      exec: () => {
        const found =
          store.find((item) => String(item._id) === String(id)) ?? null;
        if (found && !found.save) {
          found.save = () => Promise.resolve(found);
        }
        return Promise.resolve(found);
      },
    })),
    findByIdAndUpdate: jest.fn(
      (id: Types.ObjectId, update: Partial<T> | Record<string, unknown>) => ({
        exec: () => {
          const index = store.findIndex(
            (item) => String(item._id) === String(id),
          );
          if (index < 0) {
            return Promise.resolve(null);
          }
          const patch = { ...(update as Record<string, unknown>) };
          const unset = patch.$unset;
          if (unset && typeof unset === 'object') {
            for (const key of Object.keys(unset)) {
              delete (store[index] as Record<string, unknown>)[key];
            }
            delete patch.$unset;
          }
          store[index] = { ...store[index], ...(patch as Partial<T>) };
          return Promise.resolve(store[index]);
        },
      }),
    ),
    updateMany: jest.fn(
      (filter: Record<string, unknown>, update: Record<string, unknown>) => ({
        exec: () => {
          let modified = 0;
          for (let index = 0; index < store.length; index += 1) {
            if (!matches(store[index], filter)) {
              continue;
            }
            const patch = { ...update };
            const unset = patch.$unset;
            if (unset && typeof unset === 'object') {
              for (const key of Object.keys(unset)) {
                delete (store[index] as Record<string, unknown>)[key];
              }
              delete patch.$unset;
            }
            const set = patch.$set;
            if (set && typeof set === 'object') {
              store[index] = { ...store[index], ...(set as Partial<T>) };
              delete patch.$set;
            }
            store[index] = { ...store[index], ...(patch as Partial<T>) };
            modified += 1;
          }
          return Promise.resolve({ modifiedCount: modified });
        },
      }),
    ),
    findOneAndUpdate: jest.fn(
      (
        filter: Record<string, unknown>,
        update: Record<string, unknown>,
        options: { upsert?: boolean } = {},
      ) => ({
        exec: () => {
          const index = store.findIndex((item) => matches(item, filter));
          const patch =
            update.$set && typeof update.$set === 'object'
              ? (update.$set as Partial<T>)
              : (update as Partial<T>);
          if (index < 0) {
            if (!options.upsert) {
              return Promise.resolve(null);
            }
            const created = {
              ...patch,
              _id: new Types.ObjectId(),
            } as LeanDoc<T>;
            store.push(created);
            return Promise.resolve(created);
          }
          store[index] = { ...store[index], ...patch };
          return Promise.resolve(store[index]);
        },
      }),
    ),
    exists: jest.fn((filter: Record<string, unknown>) => ({
      exec: () =>
        Promise.resolve(
          store.some((item) => matches(item as Record<string, unknown>, filter))
            ? { _id: new Types.ObjectId() }
            : null,
        ),
    })),
  };
}

function getPath(item: Record<string, unknown>, key: string): unknown {
  if (!key.includes('.')) {
    return item[key];
  }
  return key.split('.').reduce<unknown>((acc, part) => {
    if (!acc || typeof acc !== 'object') {
      return undefined;
    }
    return (acc as Record<string, unknown>)[part];
  }, item);
}

function matches(
  item: Record<string, unknown>,
  filter: Record<string, unknown>,
): boolean {
  if (Array.isArray(filter.$or)) {
    return filter.$or.some((sub) =>
      matches(item, sub as Record<string, unknown>),
    );
  }

  return Object.entries(filter).every(([key, value]) => {
    if (key === '$or') {
      return true;
    }
    const left = getPath(item, key);
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const ops = value as Record<string, unknown>;
      if ('$exists' in ops) {
        const exists = left !== undefined && left !== null;
        return ops.$exists ? exists : !exists;
      }
      if ('$ne' in ops) {
        return left !== ops.$ne;
      }
      if ('$in' in ops && Array.isArray(ops.$in)) {
        return ops.$in.includes(left);
      }
      if ('$gte' in ops) {
        const bound = ops.$gte;
        if (left instanceof Date && bound instanceof Date) {
          return left.getTime() >= bound.getTime();
        }
        return (left as number) >= (bound as number);
      }
    }
    if (left instanceof Types.ObjectId || value instanceof Types.ObjectId) {
      return String(left) === String(value);
    }
    return left === value;
  });
}

function backdateCatalogOutbound(
  store: Array<{
    catalogMessageId?: Types.ObjectId;
    direction?: string;
    sentAt?: Date;
  }>,
  catalogId: string,
  msAgo = 120_000,
): void {
  const row = store.find(
    (item) =>
      item.direction === 'outbound' &&
      item.catalogMessageId &&
      String(item.catalogMessageId) === catalogId,
  );
  if (row) {
    row.sentAt = new Date(Date.now() - msAgo);
  }
}

describe('MessagingService', () => {
  const contacts = createModelMock<{
    phone: string;
    label?: string;
    active: boolean;
    tags: string[];
    language?: string;
    projectId?: string;
    projectIds?: string[];
    catalogSlotKey?: string;
    catalogSlotStartAt?: Date;
  }>();
  const templates = createModelMock<{
    key: string;
    name: string;
    description?: string;
    format: 'interactive_v1';
    body: {
      text: string;
      title?: string;
      footer?: string;
      widgets: unknown[];
    };
    active: boolean;
  }>();
  const ciclos = createModelMock<{
    name: string;
    ciclo_inicio: Date;
    ciclo_fin: Date;
    templateKey: string;
    active: boolean;
  }>();
  const workStatuses = createModelMock<{
    cicloId: Types.ObjectId;
    weekNumber: number;
    percent: number;
    duration?: string;
    avance?: string;
    notes?: string;
    asOf: Date;
  }>();
  const dispatches = createModelMock<{
    cicloId: Types.ObjectId;
    contactId: Types.ObjectId;
    phone: string;
    templateKey: string;
    weekNumber: number;
    status: string;
    renderedText: string;
    error?: string;
  }>();
  const messages = createModelMock<{
    contactId: Types.ObjectId;
    phone: string;
    direction: string;
    templateKey?: string;
    body: string;
    status: string;
    providerMessageId?: string;
    error?: string;
    sentAt?: Date;
    receivedAt?: Date;
    repliedAt?: Date;
    replyBody?: string;
    responseLatencyMs?: number;
    responseStatus?: string;
    catalogMessageId?: Types.ObjectId;
    threadId?: Types.ObjectId;
    title?: string;
    source?: string;
    taskId?: string;
    taskLabel?: string;
    sourceId?: Types.ObjectId;
    slotKey?: string;
    questionMessageId?: Types.ObjectId;
  }>();
  const catalog = createModelMock<{
    title: string;
    body: string;
    assignedContactId?: Types.ObjectId;
    sortOrder?: number;
    active: boolean;
  }>();
  const sources = createModelMock<{
    filename: string;
    content: unknown;
    projectId?: string;
    createdAt?: Date;
  }>();
  // Override create to stamp createdAt for "latest source" sorting.
  const originalSourcesCreate = sources.create;
  sources.create = jest.fn(
    (doc: { filename: string; content: unknown; projectId?: string }) => {
      return originalSourcesCreate({
        ...doc,
        createdAt: new Date(),
      });
    },
  ) as typeof sources.create;

  const accounts = createModelMock<{
    email: string;
    activeProjectId?: string;
    emailNotificationSchedule?: {
      enabled: boolean;
      frequency: 'weekly' | 'monthly';
      daysOfWeek: number[];
      dayOfMonth: number;
      sendTime: string;
      timezone: string;
    };
    lastNotificationSlot?: string;
  }>();

  const ACTIVE_PROJECT = 'proj_active';

  const isConfigured = jest.fn(() => true);
  const sendInteractive = jest.fn(() =>
    Promise.resolve({ providerMessageId: '1' }),
  );
  const invalidatePaths = jest.fn(() => Promise.resolve(undefined));

  const evolution = {
    isConfigured,
    sendInteractive,
  } as unknown as EvolutionClient;

  const cache = {
    invalidatePaths,
  } as unknown as OptionalCacheService;

  const locales = new LocaleService();

  let service: MessagingService;

  beforeEach(() => {
    for (const model of [
      contacts,
      templates,
      ciclos,
      workStatuses,
      dispatches,
      messages,
      catalog,
      sources,
      accounts,
    ]) {
      model.store.length = 0;
      jest.clearAllMocks();
    }
    isConfigured.mockReset().mockReturnValue(true);
    sendInteractive
      .mockReset()
      .mockImplementation(() => Promise.resolve({ providerMessageId: '1' }));
    sendEmail.mockReset().mockResolvedValue({ id: 'email-1' });
    invalidatePaths
      .mockReset()
      .mockImplementation(() => Promise.resolve(undefined));

    service = new MessagingService(
      contacts as never,
      templates as never,
      ciclos as never,
      workStatuses as never,
      dispatches as never,
      messages as never,
      catalog as never,
      sources as never,
      accounts as never,
      evolution,
      cache,
      locales,
    );
  });

  it('normalizes phone numbers to digits', () => {
    expect(service.normalizePhone('+54 9 11 1234-5678')).toBe('5491112345678');
    expect(() => service.normalizePhone('123')).toThrow(BadRequestException);
  });

  it('validates interactive_v1 widgets and rejects bad shapes', () => {
    expect(
      service.validateTemplateBody({
        text: 'Hi {{percent}}',
        widgets: [
          {
            type: 'button',
            id: 'a',
            label: 'A',
            action: 'url',
            url: 'https://x',
          },
          { type: 'input', id: 'b', label: 'B', placeholder: '...' },
          {
            type: 'checkbox',
            id: 'c',
            label: 'C',
            options: [{ id: '1', label: 'One' }],
          },
        ],
      }).widgets,
    ).toHaveLength(3);

    expect(() =>
      service.validateTemplateBody({ text: '', widgets: [] }),
    ).toThrow(BadRequestException);
    expect(() =>
      service.validateTemplateBody({
        text: 'x',
        widgets: 'nope' as unknown as unknown[],
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      service.validateTemplateBody({
        text: 'x',
        widgets: [null],
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      service.validateTemplateBody({
        text: 'x',
        widgets: [{ type: 'button' }],
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      service.validateTemplateBody({
        text: 'x',
        widgets: [{ type: 'input' }],
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      service.validateTemplateBody({
        text: 'x',
        widgets: [{ type: 'checkbox', id: 'c', label: 'C', options: [] }],
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      service.validateTemplateBody({
        text: 'x',
        widgets: [
          {
            type: 'checkbox',
            id: 'c',
            label: 'C',
            options: [{ id: 1, label: 'bad' }],
          },
        ],
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      service.validateTemplateBody({
        text: 'x',
        widgets: [{ type: 'unknown' }],
      }),
    ).toThrow(BadRequestException);
  });

  it('creates, lists, and updates contacts', async () => {
    const contact = await service.createContact({
      phone: '+5491112345678',
      label: 'PM',
    });
    expect(contact.phone).toBe('5491112345678');
    expect(invalidatePaths).toHaveBeenCalledWith([
      '/messaging/contacts',
      '/messaging/roster',
    ]);
    expect(await service.listContacts()).toHaveLength(1);
    await expect(
      service.updateContact(String(contact._id), { active: false }),
    ).resolves.toMatchObject({ active: false });
    await expect(
      service.updateContact(new Types.ObjectId().toHexString(), {
        active: true,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('creates, lists, and updates templates', async () => {
    await service.createTemplate({
      key: 'weekly_status',
      name: 'Weekly',
      body: { text: 'Hi {{percent}}', widgets: [] },
    });
    expect(await service.listTemplates()).toHaveLength(1);
    await service.updateTemplate('weekly_status', {
      name: 'Weekly v2',
      description: 'desc',
      active: true,
      body: {
        text: 'Semana {{week}}',
        title: '{{ciclo_name}}',
        widgets: [{ type: 'button', id: 'ack', label: 'Ok' }],
      },
    });
    await expect(
      service.updateTemplate('missing', { active: false }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('creates and updates ciclos with date validation', async () => {
    await templates.create({
      key: 'weekly_status',
      name: 'Weekly',
      format: 'interactive_v1',
      body: { text: 'x', widgets: [] },
      active: true,
    });

    await expect(
      service.createCiclo({
        name: 'C1',
        ciclo_inicio: '2026-08-01',
        ciclo_fin: '2026-07-01',
        templateKey: 'weekly_status',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.createCiclo({
        name: 'C1',
        ciclo_inicio: 'not-a-date',
        ciclo_fin: 'also-bad',
        templateKey: 'weekly_status',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.createCiclo({
        name: 'C1',
        ciclo_inicio: '2026-07-01',
        ciclo_fin: '2026-08-01',
        templateKey: 'missing',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const ciclo = await service.createCiclo({
      name: 'C1',
      ciclo_inicio: '2026-07-01',
      ciclo_fin: '2026-08-01',
      templateKey: 'weekly_status',
    });
    expect(await service.listCiclos()).toHaveLength(1);

    await service.updateCiclo(String(ciclo._id), {
      name: 'C1b',
      ciclo_inicio: '2026-07-02',
      ciclo_fin: '2026-08-02',
      templateKey: 'weekly_status',
      active: true,
    });

    await expect(
      service.updateCiclo(String(ciclo._id), {
        ciclo_inicio: '2026-09-01',
        ciclo_fin: '2026-08-01',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.updateCiclo(new Types.ObjectId().toHexString(), {
        active: false,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    await expect(
      service.updateCiclo(String(ciclo._id), { templateKey: 'nope' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('upserts and lists work statuses', async () => {
    const ciclo = await ciclos.create({
      name: 'C1',
      ciclo_inicio: new Date('2026-07-01T00:00:00Z'),
      ciclo_fin: new Date('2026-08-01T00:00:00Z'),
      templateKey: 'weekly_status',
      active: true,
    });

    await expect(
      service.upsertWorkStatus({
        cicloId: new Types.ObjectId().toHexString(),
        weekNumber: 1,
        percent: 10,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    await service.upsertWorkStatus({
      cicloId: String(ciclo._id),
      weekNumber: 1,
      percent: 20,
      duration: '1w',
      avance: 'arranque',
      notes: 'ok',
      asOf: '2026-07-01T12:00:00.000Z',
    });
    expect(await service.listWorkStatuses(String(ciclo._id))).toHaveLength(1);
    expect(await service.listWorkStatuses()).toHaveLength(1);
    await expect(service.listWorkStatuses('bad-id')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('lists dispatches and rejects invalid ids', async () => {
    expect(await service.listDispatches()).toEqual([]);
    await expect(service.listDispatches('nope')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('runs weekly dispatch for active ciclos inside the date window', async () => {
    const template = await templates.create({
      key: 'weekly_status',
      name: 'Weekly',
      format: 'interactive_v1',
      body: {
        text: 'Semana {{week}}: {{percent}}% {{avance}}',
        title: '{{ciclo_name}}',
        widgets: [{ type: 'button', id: 'ack', label: 'Ok' }],
      },
      active: true,
    });
    const ciclo = await ciclos.create({
      name: 'C1',
      ciclo_inicio: new Date('2026-07-01T00:00:00Z'),
      ciclo_fin: new Date('2026-08-01T00:00:00Z'),
      templateKey: template.key,
      active: true,
    });
    const contact = await contacts.create({
      phone: '5491112345678',
      active: true,
      tags: [],
    });
    await workStatuses.create({
      cicloId: ciclo._id,
      weekNumber: 2,
      percent: 30,
      avance: 'estructura',
      asOf: new Date('2026-07-08T00:00:00Z'),
    });

    const summaries = await service.runWeeklyStatusDispatch(
      new Date('2026-07-08T12:00:00Z'),
    );

    expect(summaries).toEqual([
      {
        cicloId: String(ciclo._id),
        weekNumber: 2,
        sent: 1,
        failed: 0,
        skipped: 0,
      },
    ]);
    expect(sendInteractive).toHaveBeenCalledTimes(1);
    const sendArgs = sendInteractive.mock.calls[0] as unknown as [
      string,
      { title?: string; text: string },
      string,
      string,
    ];
    expect(sendArgs[0]).toBe(contact.phone);
    expect(sendArgs[1].title).toBe('C1');
    expect(sendArgs[1].text).toContain('Semana 2: 30%');
    expect(sendArgs[2]).toContain('Avance: estructura');
    expect(sendArgs[3]).toBe('es');

    const second = await service.runWeeklyStatusDispatch(
      new Date('2026-07-08T12:00:00Z'),
    );
    expect(second[0]?.skipped).toBe(1);
  });

  it('skips when template or work status is missing', async () => {
    await ciclos.create({
      name: 'C1',
      ciclo_inicio: new Date('2026-07-01T00:00:00Z'),
      ciclo_fin: new Date('2026-08-01T00:00:00Z'),
      templateKey: 'missing',
      active: true,
    });
    await contacts.create({
      phone: '5491112345678',
      active: true,
      tags: [],
    });

    const summaries = await service.runWeeklyStatusDispatch(
      new Date('2026-07-08T12:00:00Z'),
    );
    expect(summaries[0]?.skipped).toBe(1);
    expect(dispatches.store[0]?.status).toBe('skipped');
  });

  it('records failures when Evolution send throws', async () => {
    await templates.create({
      key: 'weekly_status',
      name: 'Weekly',
      format: 'interactive_v1',
      body: { text: '{{percent}}', widgets: [] },
      active: true,
    });
    const ciclo = await ciclos.create({
      name: 'C1',
      ciclo_inicio: new Date('2026-07-01T00:00:00Z'),
      ciclo_fin: new Date('2026-08-01T00:00:00Z'),
      templateKey: 'weekly_status',
      active: true,
    });
    await contacts.create({
      phone: '5491112345678',
      active: true,
      tags: [],
    });
    await workStatuses.create({
      cicloId: ciclo._id,
      weekNumber: 1,
      percent: 10,
      asOf: new Date('2026-07-01T00:00:00Z'),
    });
    sendInteractive.mockImplementation(() => Promise.reject(new Error('boom')));

    const summaries = await service.runWeeklyStatusDispatch(
      new Date('2026-07-01T12:00:00Z'),
    );
    expect(summaries[0]?.failed).toBe(1);
    expect(invalidatePaths).toHaveBeenCalled();
  });

  it('claims due account slots, emails digests, and sends catalog WhatsApp', async () => {
    // Wednesday 15 Jul 2026 09:00 America/Argentina/Buenos_Aires
    const asOf = new Date('2026-07-15T12:00:00.000Z');
    await accounts.create({
      email: 'ops@example.com',
      activeProjectId: ACTIVE_PROJECT,
      emailNotificationSchedule: {
        enabled: true,
        frequency: 'weekly',
        daysOfWeek: [3],
        dayOfMonth: 1,
        sendTime: '09:00',
        timezone: 'America/Argentina/Buenos_Aires',
      },
    });
    const contact = await contacts.create({
      phone: '5491111111111',
      label: 'Estructura',
      active: true,
      tags: ['staff'],
      projectId: ACTIVE_PROJECT,
    });
    await catalog.create({
      title: 'Avance',
      body: '¿Cómo va?',
      assignedContactId: contact._id,
      active: true,
    });

    const first = await service.runScheduledNotifications(asOf);
    expect(first.emailsSent).toBe(1);
    expect(first.catalogSent).toBe(1);
    expect(first.whatsappTriggered).toBe(true);
    expect(sendEmail).toHaveBeenCalled();
    expect(sendInteractive).toHaveBeenCalled();
    const payload = sendEmail.mock.calls[0]?.[0];
    expect(payload?.to).toEqual(['ops@example.com']);
    expect(payload?.subject).toContain('semanal');

    const second = await service.runScheduledNotifications(asOf);
    expect(second.emailsSent).toBe(0);
    expect(second.dueAccounts).toBe(0);
    expect(second.catalogSent).toBe(0);
  });

  it('restarts catalog at step 1 when a new notification slot begins', async () => {
    const schedule = {
      enabled: true,
      frequency: 'weekly' as const,
      daysOfWeek: [3, 4],
      dayOfMonth: 1,
      sendTime: '09:00',
      timezone: 'America/Argentina/Buenos_Aires',
    };
    const wednesday = new Date('2026-07-15T12:00:00.000Z');
    const thursday = new Date('2026-07-16T12:00:00.000Z');
    await accounts.create({
      email: 'ops@example.com',
      activeProjectId: ACTIVE_PROJECT,
      emailNotificationSchedule: schedule,
    });
    const lead = await contacts.create({
      phone: '5491138911794',
      label: 'Benjamin',
      active: true,
      tags: ['staff'],
      projectId: ACTIVE_PROJECT,
    });
    const first = await service.createCatalogMessage({
      title: 'Performance del equipo',
      body: 'Performance',
      assignedContactId: String(lead._id),
    });
    await service.createCatalogMessage({
      title: 'Asistencia del equipo',
      body: 'Asistencia',
      assignedContactId: String(lead._id),
    });

    await service.runScheduledNotifications(wednesday);
    expect(sendInteractive).toHaveBeenCalledTimes(1);
    expect(
      (
        sendInteractive.mock.calls[0] as unknown as [string, { title?: string }]
      )[1].title,
    ).toBe('1/2 · Performance del equipo');
    expect(
      contacts.store.find((row) => String(row._id) === String(lead._id))
        ?.catalogSlotKey,
    ).toBe('2026-07-15T09:00|America/Argentina/Buenos_Aires|weekly');

    backdateCatalogOutbound(messages.store, first._id);
    await service.recordInboundMessage({
      phone: lead.phone,
      body: 'todo bien hoy',
    });
    expect(sendInteractive).toHaveBeenCalledTimes(2);
    expect(
      (
        sendInteractive.mock.calls[1] as unknown as [string, { title?: string }]
      )[1].title,
    ).toBe('2/2 · Asistencia del equipo');

    sendInteractive.mockClear();
    await service.runScheduledNotifications(thursday);
    expect(sendInteractive).toHaveBeenCalledTimes(1);
    expect(
      (
        sendInteractive.mock.calls[0] as unknown as [string, { title?: string }]
      )[1].title,
    ).toBe('1/2 · Performance del equipo');
    const stamped = contacts.store.find(
      (row) => String(row._id) === String(lead._id),
    );
    expect(stamped?.catalogSlotKey).toBe(
      '2026-07-16T09:00|America/Argentina/Buenos_Aires|weekly',
    );
  });

  it('ignores catalog replies from before the active notification slot', async () => {
    const lead = await contacts.create({
      phone: '5491122334455',
      label: 'Lead',
      active: true,
      tags: ['staff'],
      catalogSlotKey: '2026-07-16T09:00|America/Argentina/Buenos_Aires|weekly',
      catalogSlotStartAt: new Date('2026-07-16T12:00:00.000Z'),
    });
    const first = await service.createCatalogMessage({
      title: 'Uno',
      body: 'Primero',
      assignedContactId: String(lead._id),
    });
    await service.createCatalogMessage({
      title: 'Dos',
      body: 'Segundo',
      assignedContactId: String(lead._id),
    });
    const yesterday = new Date('2026-07-15T12:00:00.000Z');
    messages.store.push({
      _id: new Types.ObjectId(),
      contactId: lead._id,
      phone: lead.phone,
      direction: 'outbound',
      body: first.body,
      status: 'sent',
      source: 'catalog',
      catalogMessageId: new Types.ObjectId(first._id),
      sentAt: yesterday,
      repliedAt: new Date('2026-07-15T12:05:00.000Z'),
      replyBody: 'respondido ayer',
      title: '1/2 · Uno',
      responseStatus: 'green',
      save: () => Promise.resolve(null as never),
    });
    messages.store.push({
      _id: new Types.ObjectId(),
      contactId: lead._id,
      phone: lead.phone,
      direction: 'inbound',
      body: 'respondido ayer',
      status: 'received',
      source: 'webhook',
      catalogMessageId: new Types.ObjectId(first._id),
      receivedAt: new Date('2026-07-15T12:05:00.000Z'),
      save: () => Promise.resolve(null as never),
    });

    const batch = await service.sendAssignedCatalogMessages({
      slotStart: lead.catalogSlotStartAt,
    });
    expect(batch.sent).toBe(1);
    expect(
      (
        sendInteractive.mock.calls.at(-1) as unknown as [
          string,
          { title?: string },
        ]
      )[1].title,
    ).toBe('1/2 · Uno');
  });

  it('skips re-stamping contacts when the scheduler reclaims the same catalog slot', async () => {
    const schedule = {
      enabled: true,
      frequency: 'weekly' as const,
      daysOfWeek: [3],
      dayOfMonth: 1,
      sendTime: '09:00',
      timezone: 'America/Argentina/Buenos_Aires',
    };
    const wednesday = new Date('2026-07-15T12:00:00.000Z');
    const account = await accounts.create({
      email: 'ops@example.com',
      activeProjectId: ACTIVE_PROJECT,
      emailNotificationSchedule: schedule,
    });
    const lead = await contacts.create({
      phone: '5491138911794',
      label: 'Benjamin',
      active: true,
      tags: ['staff'],
      projectId: ACTIVE_PROJECT,
    });
    await service.createCatalogMessage({
      title: 'Performance del equipo',
      body: 'Performance',
      assignedContactId: String(lead._id),
    });

    await service.runScheduledNotifications(wednesday);
    const stamped = contacts.store.find(
      (row) => String(row._id) === String(lead._id),
    );
    const slotStartBefore = stamped?.catalogSlotStartAt;
    expect(stamped?.catalogSlotKey).toBe(
      '2026-07-15T09:00|America/Argentina/Buenos_Aires|weekly',
    );

    account.lastNotificationSlot = 'stale-slot';
    sendInteractive.mockClear();
    await service.runScheduledNotifications(wednesday);

    const after = contacts.store.find(
      (row) => String(row._id) === String(lead._id),
    );
    expect(after?.catalogSlotStartAt).toEqual(slotStartBefore);
    expect(after?.catalogSlotKey).toBe(
      '2026-07-15T09:00|America/Argentina/Buenos_Aires|weekly',
    );
  });

  it('syncCatalogDispatchSlot ignores catalog rows assigned to deleted contacts', async () => {
    const wednesday = new Date('2026-07-15T12:00:00.000Z');
    await accounts.create({
      email: 'ops@example.com',
      activeProjectId: ACTIVE_PROJECT,
      emailNotificationSchedule: {
        enabled: true,
        frequency: 'weekly',
        daysOfWeek: [3],
        dayOfMonth: 1,
        sendTime: '09:00',
        timezone: 'America/Argentina/Buenos_Aires',
      },
    });
    const lead = await contacts.create({
      phone: '5491138911794',
      label: 'Benjamin',
      active: true,
      tags: ['staff'],
      projectId: ACTIVE_PROJECT,
    });
    await service.createCatalogMessage({
      title: 'Performance del equipo',
      body: 'Performance',
      assignedContactId: String(lead._id),
    });
    await catalog.create({
      title: 'Huérfano',
      body: 'Sin contacto',
      assignedContactId: new Types.ObjectId(),
      active: true,
    });

    await service.runScheduledNotifications(wednesday);
    expect(sendInteractive).toHaveBeenCalledTimes(1);
  });

  it('does not treat a one-character catalog reply as complete', async () => {
    const lead = await contacts.create({
      phone: '5491122334455',
      label: 'Lead',
      active: true,
      tags: ['staff'],
    });
    const first = await service.createCatalogMessage({
      title: 'Uno',
      body: 'Primero',
      assignedContactId: String(lead._id),
    });
    await service.createCatalogMessage({
      title: 'Dos',
      body: 'Segundo',
      assignedContactId: String(lead._id),
    });
    await service.sendCatalogMessage(String(first._id));
    backdateCatalogOutbound(messages.store, first._id);
    await service.recordInboundMessage({
      phone: lead.phone,
      body: 'k',
    });

    expect(sendInteractive).toHaveBeenCalledTimes(1);
    sendInteractive.mockClear();
    const batch = await service.sendAssignedCatalogMessages({});
    expect(batch.sent).toBe(1);
    expect(
      (
        sendInteractive.mock.calls[0] as unknown as [string, { title?: string }]
      )[1].title,
    ).toBe('1/2 · Uno');
  });

  it('restarts catalog at step 1 when slotStart moves to a later schedule', async () => {
    const newSlotStart = new Date('2026-07-15T13:00:00.000Z');
    const lead = await contacts.create({
      phone: '5491138911794',
      label: 'Benjamin',
      active: true,
      tags: ['staff'],
      projectId: ACTIVE_PROJECT,
      catalogSlotKey: '2026-07-15T10:00|America/Argentina/Buenos_Aires|weekly',
      catalogSlotStartAt: newSlotStart,
    });
    const first = await service.createCatalogMessage({
      title: 'Performance del equipo',
      body: 'Performance',
      assignedContactId: String(lead._id),
    });
    const second = await service.createCatalogMessage({
      title: 'Asistencia del equipo',
      body: 'Asistencia',
      assignedContactId: String(lead._id),
    });
    const priorSentAt = new Date('2026-07-15T12:05:00.000Z');
    const priorReplyAt = new Date('2026-07-15T12:06:00.000Z');
    for (const [step, replyBody] of [
      [first, 'todo bien hoy'],
      [second, 'asistencia ok'],
    ] as const) {
      messages.store.push({
        _id: new Types.ObjectId(),
        contactId: lead._id,
        phone: lead.phone,
        direction: 'outbound',
        body: step.body,
        status: 'sent',
        source: 'catalog',
        catalogMessageId: new Types.ObjectId(step._id),
        sentAt: priorSentAt,
        repliedAt: priorReplyAt,
        replyBody,
        title: step.title,
        responseStatus: 'green',
        save: () => Promise.resolve(null as never),
      });
      messages.store.push({
        _id: new Types.ObjectId(),
        contactId: lead._id,
        phone: lead.phone,
        direction: 'inbound',
        body: replyBody,
        status: 'received',
        source: 'webhook',
        catalogMessageId: new Types.ObjectId(step._id),
        receivedAt: priorReplyAt,
        save: () => Promise.resolve(null as never),
      });
    }

    sendInteractive.mockClear();
    const batch = await service.sendAssignedCatalogMessages({
      slotStart: newSlotStart,
    });
    expect(batch.sent).toBe(1);
    expect(
      (
        sendInteractive.mock.calls[0] as unknown as [string, { title?: string }]
      )[1].title,
    ).toBe('1/2 · Performance del equipo');
  });

  it('records email failures and skips WhatsApp when Evolution is off', async () => {
    const asOf = new Date('2026-07-15T12:00:00.000Z');
    await accounts.create({
      email: 'ops@example.com',
      activeProjectId: ACTIVE_PROJECT,
      emailNotificationSchedule: {
        enabled: true,
        frequency: 'weekly',
        daysOfWeek: [3],
        dayOfMonth: 1,
        sendTime: '09:00',
        timezone: 'America/Argentina/Buenos_Aires',
      },
    });
    sendEmail.mockRejectedValueOnce(new Error('resend down'));
    isConfigured.mockReturnValue(false);

    const result = await service.runScheduledNotifications(asOf);
    expect(result.emailFailures).toBe(1);
    expect(result.emailsSent).toBe(0);
    expect(result.catalogSent).toBe(0);
    expect(result.whatsappTriggered).toBe(false);
  });

  it('ignores accounts that are not due this minute', async () => {
    const asOf = new Date('2026-07-15T12:01:00.000Z');
    await accounts.create({
      email: 'ops@example.com',
      activeProjectId: ACTIVE_PROJECT,
      emailNotificationSchedule: {
        enabled: true,
        frequency: 'weekly',
        daysOfWeek: [3],
        dayOfMonth: 1,
        sendTime: '09:00',
        timezone: 'America/Argentina/Buenos_Aires',
      },
    });

    const result = await service.runScheduledNotifications(asOf);
    expect(result.dueAccounts).toBe(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('CCs RESEND_TO and tolerates WhatsApp dispatch failures', async () => {
    const asOf = new Date('2026-07-15T12:00:00.000Z');
    process.env.RESEND_TO = 'copy@example.com';
    await accounts.create({
      email: 'ops@example.com',
      activeProjectId: ACTIVE_PROJECT,
      emailNotificationSchedule: {
        enabled: true,
        frequency: 'monthly',
        daysOfWeek: [1],
        dayOfMonth: 15,
        sendTime: '09:00',
        timezone: 'America/Argentina/Buenos_Aires',
      },
    });
    jest
      .spyOn(service, 'runWeeklyStatusDispatch')
      .mockRejectedValueOnce(new Error('whatsapp down'));

    const result = await service.runScheduledNotifications(asOf);
    expect(result.emailsSent).toBe(1);
    expect(result.whatsappTriggered).toBe(false);
    const payload = sendEmail.mock.calls[0]?.[0];
    expect(payload?.to).toEqual(['ops@example.com', 'copy@example.com']);
    expect(payload?.subject).toContain('mensual');
    expect(payload?.text).toContain('Sin contactos');
    delete process.env.RESEND_TO;
  });

  it('sendAssignedCatalogMessages reports failures and no-ops without Evolution', async () => {
    isConfigured.mockReturnValue(false);
    expect(await service.sendAssignedCatalogMessages()).toEqual({
      sent: 0,
      failed: 0,
      skipped: 0,
    });

    isConfigured.mockReturnValue(true);
    const contact = await contacts.create({
      phone: '5491222222222',
      label: 'Obra',
      active: true,
      tags: ['staff'],
    });
    await catalog.create({
      title: 'Avance',
      body: 'Hola',
      assignedContactId: contact._id,
      sortOrder: 1,
      active: true,
    });
    sendInteractive.mockRejectedValueOnce(new Error('boom'));
    const result = await service.sendAssignedCatalogMessages();
    expect(result.failed).toBe(1);
    expect(result.sent).toBe(0);
  });

  it('sendAssignedCatalogMessages sends only the next step per lead', async () => {
    const contact = await contacts.create({
      phone: '5491333333333',
      label: 'Capataz',
      active: true,
      tags: ['staff'],
    });
    const first = await service.createCatalogMessage({
      title: 'Uno',
      body: 'Primero',
      assignedContactId: String(contact._id),
    });
    await service.createCatalogMessage({
      title: 'Dos',
      body: 'Segundo',
      assignedContactId: String(contact._id),
    });

    const batch = await service.sendAssignedCatalogMessages();
    expect(batch.sent).toBe(1);
    expect(batch.failed).toBe(0);
    expect(sendInteractive).toHaveBeenCalledTimes(1);

    // Periodic reminder of the open step is allowed…
    await expect(
      service.sendCatalogMessage(first._id, {
        contactId: String(contact._id),
      }),
    ).resolves.toMatchObject({ ok: true });
    expect(sendInteractive).toHaveBeenCalledTimes(2);

    // …but later steps stay blocked until they reply.
    const secondId = (await service.listCatalogMessages()).find(
      (row) =>
        row.title === 'Dos' && row.assignedContactId === String(contact._id),
    )?._id;
    expect(secondId).toBeTruthy();
    await expect(
      service.sendCatalogMessage(secondId!, {
        contactId: String(contact._id),
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    backdateCatalogOutbound(messages.store, first._id, 7_200_000);
    const reminded = await service.sendAssignedCatalogMessages();
    expect(reminded.sent).toBe(1);
    expect(sendInteractive).toHaveBeenCalledTimes(3);
  });

  it('does not skip step 1 when it was closed only by a placeholder ack reply', async () => {
    const lead = await contacts.create({
      phone: '5491777777777',
      label: 'Capataz stale',
      active: true,
      tags: ['staff'],
    });
    const first = await service.createCatalogMessage({
      title: 'Paso1',
      body: 'Pregunta 1',
      assignedContactId: String(lead._id),
    });
    const second = await service.createCatalogMessage({
      title: 'Paso2',
      body: 'Pregunta 2',
      assignedContactId: String(lead._id),
    });

    const firstOutbound = {
      _id: new Types.ObjectId(),
      contactId: lead._id,
      phone: lead.phone,
      direction: 'outbound',
      body: first.body,
      status: 'sent',
      source: 'catalog',
      catalogMessageId: new Types.ObjectId(first._id),
      sentAt: new Date(Date.now() - 120_000),
      repliedAt: new Date(Date.now() - 60_000),
      replyBody: '(respuesta recibida)',
      title: '1/2 · Paso1',
      responseStatus: 'pending',
      save: () => Promise.resolve(null as never),
    };
    messages.store.push(firstOutbound);
    messages.store.push({
      _id: new Types.ObjectId(),
      contactId: lead._id,
      phone: lead.phone,
      direction: 'outbound',
      body: second.body,
      status: 'sent',
      source: 'catalog',
      catalogMessageId: new Types.ObjectId(second._id),
      sentAt: new Date(Date.now() - 90_000),
      title: '2/2 · Paso2',
      save: () => Promise.resolve(null as never),
    });

    const before = sendInteractive.mock.calls.length;
    const batch = await service.sendAssignedCatalogMessages();
    expect(batch.sent).toBe(1);
    expect(sendInteractive.mock.calls.length).toBe(before + 1);
    const sentBody = String(sendInteractive.mock.calls.at(-1)?.[1]?.text ?? '');
    expect(sentBody).toBe('Pregunta 1');
    expect(firstOutbound.repliedAt).toBeUndefined();
    expect(firstOutbound.replyBody).toBeUndefined();
  });

  it('does not skip step 1 when outbound was closed without a matching inbound', async () => {
    const lead = await contacts.create({
      phone: '5491888888888',
      label: 'Capataz ghost',
      active: true,
      tags: ['staff'],
    });
    const first = await service.createCatalogMessage({
      title: 'Paso1',
      body: 'Pregunta 1',
      assignedContactId: String(lead._id),
    });
    await service.createCatalogMessage({
      title: 'Paso2',
      body: 'Pregunta 2',
      assignedContactId: String(lead._id),
    });

    const firstOutbound = {
      _id: new Types.ObjectId(),
      contactId: lead._id,
      phone: lead.phone,
      direction: 'outbound',
      body: first.body,
      status: 'sent',
      source: 'catalog',
      catalogMessageId: new Types.ObjectId(first._id),
      sentAt: new Date(Date.now() - 120_000),
      repliedAt: new Date(Date.now() - 60_000),
      replyBody: 'ok',
      title: '1/2 · Paso1',
      responseStatus: 'green',
      save: () => Promise.resolve(null as never),
    };
    messages.store.push(firstOutbound);

    const before = sendInteractive.mock.calls.length;
    const batch = await service.sendAssignedCatalogMessages();
    expect(batch.sent).toBe(1);
    expect(sendInteractive.mock.calls.length).toBe(before + 1);
    expect(
      (
        sendInteractive.mock.calls.at(-1) as unknown as [
          string,
          { title?: string; text?: string },
        ]
      )[1].title,
    ).toBe('1/2 · Paso1');
    expect(firstOutbound.repliedAt).toBeUndefined();
  });

  it('advances to 2/2 immediately after a real reply without waiting for the scheduler', async () => {
    const lead = await contacts.create({
      phone: '5491138911794',
      label: 'Benjamin',
      active: true,
      tags: ['staff'],
      projectId: ACTIVE_PROJECT,
    });
    const first = await service.createCatalogMessage({
      title: 'Performance del equipo',
      body: 'Performance',
      assignedContactId: String(lead._id),
    });
    await service.createCatalogMessage({
      title: 'Asistencia del equipo',
      body: 'Asistencia',
      assignedContactId: String(lead._id),
    });

    await service.sendCatalogMessage(String(first._id));
    expect(sendInteractive).toHaveBeenCalledTimes(1);
    expect(
      (
        sendInteractive.mock.calls[0] as unknown as [string, { title?: string }]
      )[1].title,
    ).toBe('1/2 · Performance del equipo');

    // Real human replies often land within seconds — must still unlock step 2.
    await service.recordInboundMessage({
      phone: lead.phone,
      body: 'todo bien hoy con el equipo',
    });

    expect(sendInteractive).toHaveBeenCalledTimes(2);
    expect(
      (
        sendInteractive.mock.calls[1] as unknown as [string, { title?: string }]
      )[1].title,
    ).toBe('2/2 · Asistencia del equipo');
  });

  it('does not treat instant Recibido acks as completing step 1', async () => {
    const lead = await contacts.create({
      phone: '5491999999999',
      label: 'Benjamin',
      active: true,
      tags: ['staff'],
    });
    const first = await service.createCatalogMessage({
      title: 'Performance del equipo',
      body: 'Performance',
      assignedContactId: String(lead._id),
    });
    await service.createCatalogMessage({
      title: 'Asistencia del equipo',
      body: 'Asistencia',
      assignedContactId: String(lead._id),
    });

    messages.store.push({
      _id: new Types.ObjectId(),
      contactId: lead._id,
      phone: lead.phone,
      direction: 'outbound',
      body: first.body,
      status: 'sent',
      source: 'catalog',
      catalogMessageId: new Types.ObjectId(first._id),
      sentAt: new Date(Date.now() - 5_000),
      repliedAt: new Date(Date.now() - 4_000),
      replyBody: 'Recibido',
      title: '1/2 · Performance del equipo',
      responseStatus: 'green',
      save: () => Promise.resolve(null as never),
    });
    messages.store.push({
      _id: new Types.ObjectId(),
      contactId: lead._id,
      phone: lead.phone,
      direction: 'inbound',
      body: 'Recibido',
      status: 'received',
      source: 'webhook',
      catalogMessageId: new Types.ObjectId(first._id),
      receivedAt: new Date(Date.now() - 4_000),
      save: () => Promise.resolve(null as never),
    });

    const batch = await service.sendAssignedCatalogMessages();
    expect(batch.sent).toBe(1);
    expect(
      (
        sendInteractive.mock.calls.at(-1) as unknown as [
          string,
          { title?: string },
        ]
      )[1].title,
    ).toBe('1/2 · Performance del equipo');
  });

  it('resets catalog reply state so the sequence restarts at step 1', async () => {
    const lead = await contacts.create({
      phone: '5491138911794',
      label: 'Benjamin',
      active: true,
      tags: ['staff'],
      projectId: ACTIVE_PROJECT,
    });
    const first = await service.createCatalogMessage({
      title: 'Performance del equipo',
      body: 'Performance',
      assignedContactId: String(lead._id),
    });
    await service.createCatalogMessage({
      title: 'Asistencia del equipo',
      body: 'Asistencia',
      assignedContactId: String(lead._id),
    });
    messages.store.push({
      _id: new Types.ObjectId(),
      contactId: lead._id,
      phone: lead.phone,
      direction: 'outbound',
      body: first.body,
      status: 'sent',
      source: 'catalog',
      catalogMessageId: new Types.ObjectId(first._id),
      sentAt: new Date(Date.now() - 120_000),
      repliedAt: new Date(Date.now() - 60_000),
      replyBody: 'Recibido',
      title: '1/2 · Performance del equipo',
      responseStatus: 'green',
      save: () => Promise.resolve(null as never),
    });

    const reset = await service.resetCatalogSequence(String(lead._id));
    expect(reset).toEqual({ ok: true, reset: 1 });

    await expect(
      service.resetCatalogSequence(new Types.ObjectId().toHexString()),
    ).rejects.toBeInstanceOf(NotFoundException);

    const batch = await service.sendAssignedCatalogMessages();
    expect(batch.sent).toBe(1);
    expect(
      (
        sendInteractive.mock.calls.at(-1) as unknown as [
          string,
          { title?: string },
        ]
      )[1].title,
    ).toBe('1/2 · Performance del equipo');
  });

  it('advances to the next catalog step after a reply even if later steps were already blasted', async () => {
    const lead = await contacts.create({
      phone: '5491444444444',
      label: 'Jefe',
      active: true,
      tags: ['staff'],
    });
    const first = await service.createCatalogMessage({
      title: 'Paso1',
      body: 'Pregunta 1',
      assignedContactId: String(lead._id),
    });
    const second = await service.createCatalogMessage({
      title: 'Paso2',
      body: 'Pregunta 2',
      assignedContactId: String(lead._id),
    });
    const third = await service.createCatalogMessage({
      title: 'Paso3',
      body: 'Pregunta 3',
      assignedContactId: String(lead._id),
    });

    await service.sendCatalogMessage(first._id, {
      contactId: String(lead._id),
    });
    backdateCatalogOutbound(messages.store, first._id);
    // Simulate an older flood that already dropped later steps.
    messages.store.push({
      _id: new Types.ObjectId(),
      contactId: lead._id,
      phone: lead.phone,
      direction: 'outbound',
      body: second.body,
      status: 'sent',
      source: 'catalog',
      catalogMessageId: new Types.ObjectId(second._id),
      sentAt: new Date(Date.now() - 60_000),
      title: '2/3 · Paso2',
      save: () => Promise.resolve(null as never),
    });
    messages.store.push({
      _id: new Types.ObjectId(),
      contactId: lead._id,
      phone: lead.phone,
      direction: 'outbound',
      body: third.body,
      status: 'sent',
      source: 'catalog',
      catalogMessageId: new Types.ObjectId(third._id),
      sentAt: new Date(Date.now() - 30_000),
      title: '3/3 · Paso3',
      save: () => Promise.resolve(null as never),
    });

    const before = sendInteractive.mock.calls.length;
    await service.recordInboundMessage({
      phone: lead.phone,
      body: 'respuesta al primero',
    });
    // Step 2 was already blasted open — do not re-send; just close step 1.
    expect(sendInteractive.mock.calls.length).toBe(before);
    const openFirst = messages.store.find(
      (item) =>
        String(item.catalogMessageId) === first._id &&
        item.direction === 'outbound' &&
        item.repliedAt,
    );
    expect(openFirst).toBeTruthy();

    // Empty / ack-style inbounds must not invent a catalog advance.
    expect(
      service.extractInboundFromEvolution({
        data: {
          key: { remoteJid: `${lead.phone}@s.whatsapp.net`, fromMe: false },
          message: {},
        },
      }),
    ).toBeNull();
    await service.recordInboundMessage({
      phone: lead.phone,
      body: '',
    });
    await service.recordInboundMessage({
      phone: lead.phone,
      body: '(respuesta recibida)',
    });
    expect(sendInteractive.mock.calls.length).toBe(before);
  });

  it('ignores inactive/mismatched catalog opens when matching a reply', async () => {
    const lead = await contacts.create({
      phone: '5491555555555',
      label: 'Lead',
      active: true,
      tags: ['staff'],
    });
    const other = await contacts.create({
      phone: '5491666666666',
      label: 'Otro',
      active: true,
      tags: ['staff'],
    });
    const only = await service.createCatalogMessage({
      title: 'Solo',
      body: 'Una sola',
      assignedContactId: String(lead._id),
    });
    await service.sendCatalogMessage(only._id, {
      contactId: String(lead._id),
    });
    backdateCatalogOutbound(messages.store, only._id);
    const inactive = await catalog.create({
      title: 'Inactivo',
      body: 'x',
      assignedContactId: lead._id,
      sortOrder: 9,
      active: false,
    });
    messages.store.push({
      _id: new Types.ObjectId(),
      contactId: lead._id,
      phone: lead.phone,
      direction: 'outbound',
      body: 'x',
      status: 'sent',
      source: 'catalog',
      catalogMessageId: inactive._id,
      sentAt: new Date(Date.now() - 10_000),
      title: 'Inactivo',
      save: () => Promise.resolve(null as never),
    });
    const mismatched = await catalog.create({
      title: 'Ajeno',
      body: 'y',
      assignedContactId: other._id,
      sortOrder: 1,
      active: true,
    });
    messages.store.push({
      _id: new Types.ObjectId(),
      contactId: lead._id,
      phone: lead.phone,
      direction: 'outbound',
      body: 'y',
      status: 'sent',
      source: 'catalog',
      catalogMessageId: mismatched._id,
      sentAt: new Date(Date.now() - 5_000),
      title: 'Ajeno',
      save: () => Promise.resolve(null as never),
    });

    const before = sendInteractive.mock.calls.length;
    await service.recordInboundMessage({
      phone: lead.phone,
      body: 'ok solo',
    });
    // Single-step sequence: reply closes it and does not advance.
    expect(sendInteractive.mock.calls.length).toBe(before);
    expect(
      messages.store.some(
        (item) =>
          String(item.catalogMessageId) === only._id && Boolean(item.repliedAt),
      ),
    ).toBe(true);
  });

  it('ignores ciclos outside the date window', async () => {
    await ciclos.create({
      name: 'C1',
      ciclo_inicio: new Date('2026-01-01T00:00:00Z'),
      ciclo_fin: new Date('2026-01-31T00:00:00Z'),
      templateKey: 'weekly_status',
      active: true,
    });
    await expect(
      service.runWeeklyStatusDispatch(new Date('2026-07-08T12:00:00Z')),
    ).resolves.toEqual([]);
  });

  it('skips when Evolution is not configured', async () => {
    isConfigured.mockReturnValue(false);
    await expect(service.runWeeklyStatusDispatch()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('records inbound replies against matching staff contacts', async () => {
    const contact = await contacts.create({
      phone: '5491112345678',
      label: 'Ana',
      active: true,
      tags: ['staff'],
    });

    const recorded = await service.recordInboundMessage({
      phone: '5491112345678',
      body: 'ack',
    });
    expect(recorded.contactId).toBe(String(contact._id));
    expect(messages.store).toHaveLength(1);
    expect(messages.store[0]?.direction).toBe('inbound');

    const roster = await service.listStaffRoster();
    expect(roster[0]?.lastReceivedAt).toBeTruthy();

    await expect(
      service.recordInboundMessage({ phone: '5491100000000', text: 'hola' }),
    ).resolves.toMatchObject({ contactId: null });
  });

  it('creates catalog messages, assigns staff, and records precise reply latency', async () => {
    const contact = await contacts.create({
      phone: '5491112345678',
      label: 'Estructura',
      active: true,
      tags: ['staff'],
    });

    const catalogMessage = await service.createCatalogMessage({
      title: 'Avance semanal',
      body: '¿Cómo va la estructura?',
      assignedContactId: String(contact._id),
    });
    expect(catalogMessage.assignedLabel).toBe('Estructura');
    expect(sendInteractive).not.toHaveBeenCalled();

    await service.sendCatalogMessage(catalogMessage._id, {
      contactId: String(contact._id),
    });
    backdateCatalogOutbound(messages.store, catalogMessage._id);
    expect(sendInteractive).toHaveBeenCalled();

    const reply = await service.recordInboundMessage({
      phone: '5491112345678',
      body: 'Vamos bien',
    });
    expect(reply.responseLatencyMs).toBeGreaterThanOrEqual(0);
    expect(reply.responseStatus).toBe('green');

    const listed = await service.listCatalogMessages();
    expect(listed[0]?.lastSentAt).toBeTruthy();
    expect(listed[0]?.repliedAt).toBeTruthy();
    expect(listed[0]?.responseStatus).toBe('green');
  });

  it('updates, unassigns, and validates catalog send prerequisites', async () => {
    const contact = await contacts.create({
      phone: '5491199999999',
      label: 'Obra',
      active: true,
      tags: ['staff'],
    });
    const created = await service.createCatalogMessage({
      title: 'Draft',
      body: 'Hola equipo',
    });
    await expect(
      service.sendCatalogMessage(created._id, {}),
    ).rejects.toBeInstanceOf(BadRequestException);

    const assigned = await service.assignCatalogMessage(
      created._id,
      String(contact._id),
    );
    expect(assigned.assignedPhone).toBe('5491199999999');
    expect(sendInteractive).not.toHaveBeenCalled();

    const updated = await service.updateCatalogMessage(created._id, {
      title: 'Draft v2',
      assignedContactId: '',
    });
    expect(updated.title).toBe('Draft v2');
    expect(updated.assignedContactId).toBeNull();

    sendInteractive.mockRejectedValueOnce(new Error('provider down'));
    await expect(
      service.sendCatalogMessage(created._id, {
        contactId: String(contact._id),
      }),
    ).rejects.toThrow('provider down');
    expect(
      messages.store.some(
        (item) => item.source === 'catalog' && item.status === 'failed',
      ),
    ).toBe(true);
  });

  it('soft-deletes catalog messages so they leave the active list', async () => {
    const inactive = await service.createCatalogMessage({
      title: 'Inactivo',
      body: 'No listar',
      active: false,
    });
    expect(inactive.active).toBe(false);
    expect(await service.listCatalogMessages()).toHaveLength(0);

    const created = await service.createCatalogMessage({
      title: 'Borrar',
      body: 'Temporal',
    });
    expect(await service.listCatalogMessages()).toHaveLength(1);
    await expect(service.deleteCatalogMessage(created._id)).resolves.toEqual({
      ok: true,
    });
    expect(await service.listCatalogMessages()).toHaveLength(0);
    await expect(
      service.deleteCatalogMessage(created._id),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('orders catalog messages per lead and advances on reply', async () => {
    const lead = await contacts.create({
      phone: '5491199001122',
      label: 'Capataz',
      active: true,
      tags: ['staff'],
      language: 'es',
    });
    const first = await service.createCatalogMessage({
      title: 'Uno',
      body: 'Primero',
      assignedContactId: String(lead._id),
    });
    const second = await service.createCatalogMessage({
      title: 'Dos',
      body: 'Segundo',
      assignedContactId: String(lead._id),
    });
    expect(first.sortOrder).toBe(1);
    expect(second.sortOrder).toBe(2);

    const reordered = await service.reorderCatalogMessages({
      contactId: String(lead._id),
      orderedIds: [second._id, first._id],
    });
    const forLead = reordered.filter(
      (row) => row.assignedContactId === String(lead._id),
    );
    expect(forLead.map((row) => row._id)).toEqual([second._id, first._id]);
    expect(forLead.map((row) => row.sortOrder)).toEqual([1, 2]);

    const before = sendInteractive.mock.calls.length;
    await service.sendCatalogMessage(second._id, {
      contactId: String(lead._id),
    });
    expect(
      (
        sendInteractive.mock.calls[before] as unknown as [
          string,
          { title?: string },
        ]
      )[1].title,
    ).toBe('1/2 · Dos');

    backdateCatalogOutbound(messages.store, second._id);
    await service.recordInboundMessage({
      phone: lead.phone,
      body: 'ok',
    });
    expect(sendInteractive.mock.calls.length).toBe(before + 2);
    expect(
      (
        sendInteractive.mock.calls[before + 1] as unknown as [
          string,
          { title?: string },
        ]
      )[1].title,
    ).toBe('2/2 · Uno');

    const other = await contacts.create({
      phone: '5491199003344',
      label: 'Otro',
      active: true,
      tags: ['staff'],
      language: 'es',
    });
    await expect(
      service.reorderCatalogMessages({
        contactId: String(lead._id),
        orderedIds: [],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.reorderCatalogMessages({
        contactId: String(lead._id),
        orderedIds: [first._id, first._id],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.reorderCatalogMessages({
        contactId: String(lead._id),
        orderedIds: [first._id],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.reorderCatalogMessages({
        contactId: String(other._id),
        orderedIds: [first._id, second._id],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.reorderCatalogMessages({
        contactId: new Types.ObjectId().toHexString(),
        orderedIds: [first._id, second._id],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    const lone = await service.createCatalogMessage({
      title: 'Solo',
      body: 'Uno solo',
      assignedContactId: String(other._id),
    });
    expect(lone.sortOrder).toBe(1);
    const beforeLone = sendInteractive.mock.calls.length;
    await service.sendCatalogMessage(lone._id, {
      contactId: String(other._id),
    });
    backdateCatalogOutbound(messages.store, lone._id);
    await service.recordInboundMessage({
      phone: other.phone,
      body: 'fin',
    });
    expect(sendInteractive.mock.calls.length).toBe(beforeLone + 1);

    await service.updateCatalogMessage(first._id, { assignedContactId: '' });
    expect(
      (await service.listCatalogMessages()).find((row) => row._id === first._id)
        ?.sortOrder,
    ).toBe(0);
    expect(
      (await service.listCatalogMessages()).find(
        (row) => row._id === second._id,
      )?.sortOrder,
    ).toBe(1);

    await service.assignCatalogMessage(first._id, String(lead._id));
    expect(
      (await service.listCatalogMessages()).find((row) => row._id === first._id)
        ?.sortOrder,
    ).toBe(2);

    const legacy = await catalog.create({
      title: 'Legacy',
      body: 'sin orden',
      assignedContactId: other._id,
      sortOrder: 0,
      active: true,
    });
    await catalog.create({
      title: 'Legacy2',
      body: 'sin orden 2',
      assignedContactId: other._id,
      sortOrder: 0,
      active: true,
    });
    const listed = await service.listCatalogMessages();
    expect(
      listed
        .filter((row) => row.assignedContactId === String(other._id))
        .every((row) => row.sortOrder >= 1),
    ).toBe(true);
    expect(legacy.sortOrder).toBeGreaterThan(0);

    await service.deleteCatalogMessage(second._id);
    expect(
      (await service.listCatalogMessages()).find((row) => row._id === first._id)
        ?.sortOrder,
    ).toBe(1);
  });

  it('records outbound staff messages on test-send and remind', async () => {
    await templates.create({
      key: 'weekly_status',
      name: 'Weekly',
      format: 'interactive_v1',
      body: { text: 'Percent {{percent}}', widgets: [] },
      active: true,
    });
    const contact = await contacts.create({
      phone: '5491112345678',
      label: 'Ana',
      active: true,
      tags: ['staff'],
      language: 'es',
    });

    const sent = await service.sendTestMessage({
      phone: '5491112345678',
      templateKey: 'weekly_status',
      percent: '80',
    });
    expect(sent.ok).toBe(true);
    expect(messages.store.some((item) => item.source === 'test')).toBe(true);

    sendInteractive.mockRejectedValueOnce(new Error('send failed'));
    await expect(
      service.sendTestMessage({
        phone: '5491112345678',
        templateKey: 'weekly_status',
      }),
    ).rejects.toThrow('send failed');

    const reminded = await service.remindContact(String(contact._id));
    expect(reminded.ok).toBe(true);
    expect(
      messages.store.filter((item) => item.source === 'remind').length,
    ).toBeGreaterThan(0);

    sendInteractive.mockRejectedValueOnce(new Error('remind failed'));
    await expect(service.remindContact(String(contact._id))).rejects.toThrow(
      'remind failed',
    );

    await expect(
      service.sendTestMessage({
        phone: '5491100000000',
        templateKey: 'missing',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    await expect(
      service.sendCatalogMessage(new Types.ObjectId().toHexString(), {}),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('parses Evolution webhook payloads into inbound DTOs', () => {
    expect(
      service.extractInboundFromEvolution({
        data: {
          key: { remoteJid: '5491112345678@s.whatsapp.net', fromMe: false },
          message: { conversation: 'Recibido' },
        },
      }),
    ).toMatchObject({
      phone: '5491112345678',
      body: 'Recibido',
    });
    expect(
      service.extractInboundFromEvolution({
        event: 'messages.upsert',
        data: [
          {
            key: {
              remoteJid: '5491112345678@s.whatsapp.net',
              fromMe: false,
            },
            message: { conversation: 'Hola' },
          },
        ],
      }),
    ).toMatchObject({ phone: '5491112345678', body: 'Hola' });
    expect(
      service.extractInboundFromEvolution({
        data: JSON.stringify({
          key: {
            remoteJid: '5491112345678@s.whatsapp.net',
            fromMe: false,
          },
          message: { conversation: 'via-json-string' },
        }),
      }),
    ).toMatchObject({ body: 'via-json-string' });
    expect(
      service.extractInboundFromEvolution({
        data: {
          key: {
            remoteJid: '13104062693415@lid',
            remoteJidAlt: '5491199887766@s.whatsapp.net',
            fromMe: false,
          },
          message: { conversation: 'Día completo' },
        },
      }),
    ).toMatchObject({
      phone: '5491199887766',
      body: 'Día completo',
    });
    expect(
      service.extractInboundFromEvolution({
        data: {
          key: {
            remoteJid: '13104062693415@lid',
            senderPn: '5491188776655',
            fromMe: false,
          },
          message: { conversation: 'ok' },
        },
      }),
    ).toMatchObject({ phone: '5491188776655' });
    expect(
      service.extractInboundFromEvolution({
        data: {
          key: { remoteJid: '13104062693415@lid', fromMe: false },
          message: { conversation: 'hola' },
        },
      }),
    ).toBeNull();
    expect(
      service.extractInboundFromEvolution({
        data: {
          key: { remoteJid: '5491112345678@s.whatsapp.net', fromMe: false },
          message: { extendedTextMessage: { text: 'extendido' } },
        },
      }),
    ).toMatchObject({ body: 'extendido' });
    expect(
      service.extractInboundFromEvolution({
        data: { key: { fromMe: true, remoteJid: 'x' } },
      }),
    ).toBeNull();
    expect(
      service.extractInboundFromEvolution({
        data: {
          key: { remoteJid: '5491112345678@s.whatsapp.net', fromMe: false },
          message: { protocolMessage: { type: 0 } },
        },
      }),
    ).toBeNull();
    expect(
      service.extractInboundFromEvolution({
        data: {
          key: { remoteJid: '5491112345678@s.whatsapp.net', fromMe: false },
          message: { reactionMessage: { text: '👍' } },
        },
      }),
    ).toBeNull();
    expect(
      service.extractInboundFromEvolution({
        data: {
          key: { remoteJid: '5491112345678@s.whatsapp.net', fromMe: false },
          message: { messageStubType: 1 },
        },
      }),
    ).toBeNull();
    expect(
      service.extractInboundFromEvolution({
        data: {
          key: { remoteJid: '5491112345678@s.whatsapp.net', fromMe: false },
          message: { senderKeyDistributionMessage: {} },
        },
      }),
    ).toBeNull();
  });

  it('asks pending objective tasks after catalog is complete and advances on reply', async () => {
    await accounts.create({
      email: 'ops@example.com',
      activeProjectId: ACTIVE_PROJECT,
    });
    const lead = await contacts.create({
      phone: '5491138911794',
      label: 'Benjamin',
      active: true,
      tags: ['staff'],
      projectIds: ['proj_other', ACTIVE_PROJECT],
      projectId: 'proj_other',
      catalogSlotKey: '2026-07-15T09:00|America/Argentina/Buenos_Aires|weekly',
      catalogSlotStartAt: new Date('2026-07-15T12:00:00.000Z'),
    });
    const only = await service.createCatalogMessage({
      title: 'Performance del equipo',
      body: 'Performance',
      assignedContactId: String(lead._id),
    });
    await sources.create({
      filename: 'other.json',
      projectId: 'proj_other',
      content: {
        meta: { projectId: 'proj_other', projectNombre: 'Otra' },
        tareas_con_objetivo: [],
      },
    });
    await sources.create({
      filename: 'obra.json',
      projectId: ACTIVE_PROJECT,
      content: {
        meta: { projectId: ACTIVE_PROJECT, projectNombre: 'Pier' },
        tareas_con_objetivo: [
          {
            id: 'carp',
            label: 'colocacion carpinterias',
            avance_base: 40,
          },
          { id: 'done', label: 'ya terminada', avance_base: 100 },
          { id: 'pint', label: 'pintura', avance_base: 10 },
        ],
      },
    });

    await service.sendCatalogMessage(String(only._id));
    backdateCatalogOutbound(messages.store, only._id);
    sendInteractive.mockClear();

    await service.recordInboundMessage({
      phone: lead.phone,
      body: 'performance ok',
    });
    expect(sendInteractive).toHaveBeenCalledTimes(1);
    expect(
      (
        sendInteractive.mock.calls[0] as unknown as [
          string,
          { title?: string; text?: string },
        ]
      )[1].title,
    ).toBe('Pier · Tarea 1/2 · colocacion carpinterias');
    expect(
      (
        sendInteractive.mock.calls[0] as unknown as [
          string,
          { title?: string; text?: string },
        ]
      )[1].text,
    ).toContain('Obra Pier:');
    const firstAsk = messages.store.find(
      (row) =>
        row.source === 'task_checklist' &&
        row.direction === 'outbound' &&
        row.taskId === 'carp',
    );
    expect(firstAsk?.repliedAt).toBeUndefined();

    sendInteractive.mockClear();
    await service.recordInboundMessage({
      phone: lead.phone,
      body: 'carpinteria al 60%',
    });
    expect(firstAsk?.replyBody).toBe('carpinteria al 60%');
    expect(firstAsk?.repliedAt).toBeTruthy();
    const inboundAsk = messages.store.find(
      (row) =>
        row.direction === 'inbound' &&
        row.taskId === 'carp' &&
        row.body === 'carpinteria al 60%',
    );
    expect(String(inboundAsk?.questionMessageId)).toBe(String(firstAsk?._id));
    expect(inboundAsk?.title).toBe(
      'Pier · Tarea 1/2 · colocacion carpinterias',
    );
    expect(inboundAsk?.threadId).toBeTruthy();
    expect(sendInteractive).toHaveBeenCalledTimes(1);
    expect(
      (
        sendInteractive.mock.calls[0] as unknown as [string, { title?: string }]
      )[1].title,
    ).toBe('Pier · Tarea 2/2 · pintura');

    const listed = await service.listTaskChecklists({
      contactId: String(lead._id),
    });
    expect(listed.length).toBeGreaterThanOrEqual(2);
  });

  it('does not start task checklist while a catalog step is still open', async () => {
    const lead = await contacts.create({
      phone: '5491138911795',
      label: 'Benjamin',
      active: true,
      tags: ['staff'],
      projectId: ACTIVE_PROJECT,
      catalogSlotKey: '2026-07-15T09:00|America/Argentina/Buenos_Aires|weekly',
      catalogSlotStartAt: new Date('2026-07-15T12:00:00.000Z'),
    });
    await service.createCatalogMessage({
      title: 'Performance del equipo',
      body: 'Performance',
      assignedContactId: String(lead._id),
    });
    await service.createCatalogMessage({
      title: 'Asistencia',
      body: 'Asistencia',
      assignedContactId: String(lead._id),
    });
    await sources.create({
      filename: 'obra.json',
      projectId: ACTIVE_PROJECT,
      content: {
        tareas_con_objetivo: [
          { id: 'carp', label: 'colocacion carpinterias', avance_base: 20 },
        ],
      },
    });

    await service.sendCatalogMessage(
      String(
        catalog.store.find((row) => row.title === 'Performance del equipo')
          ?._id,
      ),
    );
    sendInteractive.mockClear();
    await (
      service as unknown as {
        kickoffTaskChecklists: (k: string) => Promise<void>;
      }
    ).kickoffTaskChecklists(
      '2026-07-15T09:00|America/Argentina/Buenos_Aires|weekly',
      [ACTIVE_PROJECT],
    );
    expect(sendInteractive).not.toHaveBeenCalled();
    expect(
      messages.store.filter((row) => row.source === 'task_checklist'),
    ).toHaveLength(0);
  });

  it('forces task kickoff after catalog reply even if catalog sequence still open', async () => {
    await accounts.create({
      email: 'force@example.com',
      activeProjectId: ACTIVE_PROJECT,
    });
    const lead = await contacts.create({
      phone: '5491138911799',
      label: 'Force',
      active: true,
      tags: ['staff'],
      projectIds: [ACTIVE_PROJECT],
      projectId: ACTIVE_PROJECT,
      catalogSlotKey: 'slot-force',
      catalogSlotStartAt: new Date('2026-07-15T12:00:00.000Z'),
    });
    const catalogMsg = await service.createCatalogMessage({
      title: 'Avance',
      body: '¿Cómo va?',
      assignedContactId: String(lead._id),
    });
    await sources.create({
      filename: 'obra.json',
      projectId: ACTIVE_PROJECT,
      content: {
        meta: { projectId: ACTIVE_PROJECT, projectNombre: 'Pier' },
        tareas_con_objetivo: [
          { id: 'carp', label: 'colocacion carpinterias', avance_base: 20 },
        ],
      },
    });
    await service.sendCatalogMessage(String(catalogMsg._id), undefined, {
      catalogSlotStart: lead.catalogSlotStartAt,
    });
    sendInteractive.mockClear();
    await (
      service as unknown as {
        tryStartTaskChecklistForContact: (
          contact: (typeof contacts.store)[0],
          preferred?: string,
          options?: { afterCatalogReply?: boolean },
        ) => Promise<void>;
      }
    ).tryStartTaskChecklistForContact(lead, ACTIVE_PROJECT, {
      afterCatalogReply: true,
    });
    expect(sendInteractive).toHaveBeenCalledTimes(1);
    expect(
      (
        sendInteractive.mock.calls[0] as unknown as [string, { title?: string }]
      )[1].title,
    ).toContain('Pier · Tarea 1/1');

    sendInteractive.mockClear();
    await (
      service as unknown as {
        sendNextTaskChecklistAsk: (
          contact: (typeof contacts.store)[0],
          slotKey: string,
        ) => Promise<void>;
      }
    ).sendNextTaskChecklistAsk(lead, 'slot-force');
    expect(sendInteractive).not.toHaveBeenCalled();
  });

  it('ignores ack-like replies for open task checklist asks', async () => {
    const lead = await contacts.create({
      phone: '5491138911796',
      label: 'Benjamin',
      active: true,
      tags: ['staff'],
      projectId: ACTIVE_PROJECT,
      catalogSlotKey: 'slot-a',
      catalogSlotStartAt: new Date('2026-07-15T12:00:00.000Z'),
    });
    await sources.create({
      filename: 'obra.json',
      projectId: ACTIVE_PROJECT,
      content: {
        tareas_con_objetivo: [
          { id: 'carp', label: 'colocacion carpinterias', avance_base: 20 },
          { id: 'pint', label: 'pintura', avance_base: 10 },
        ],
      },
    });
    await (
      service as unknown as {
        sendNextTaskChecklistAsk: (
          contact: (typeof contacts.store)[0],
          slotKey: string,
        ) => Promise<void>;
      }
    ).sendNextTaskChecklistAsk(lead, 'slot-a');
    expect(sendInteractive).toHaveBeenCalledTimes(1);
    sendInteractive.mockClear();

    await service.recordInboundMessage({
      phone: lead.phone,
      body: 'Recibido',
    });
    expect(sendInteractive).not.toHaveBeenCalled();
    const ask = messages.store.find(
      (row) => row.source === 'task_checklist' && row.direction === 'outbound',
    );
    expect(ask?.repliedAt).toBeUndefined();
  });

  it('skips task checklist when Evolution is off or no pending tasks exist', async () => {
    const lead = await contacts.create({
      phone: '5491138911797',
      label: 'Benjamin',
      active: true,
      tags: ['staff'],
      catalogSlotKey: 'slot-b',
      catalogSlotStartAt: new Date('2026-07-15T12:00:00.000Z'),
    });
    isConfigured.mockReturnValue(false);
    await (
      service as unknown as {
        sendNextTaskChecklistAsk: (
          contact: (typeof contacts.store)[0],
          slotKey: string,
        ) => Promise<void>;
      }
    ).sendNextTaskChecklistAsk(lead, 'slot-b');
    expect(
      messages.store.filter((row) => row.source === 'task_checklist'),
    ).toHaveLength(0);

    isConfigured.mockReturnValue(true);
    const orphan = await contacts.create({
      phone: '5491138911801',
      label: 'Orphan',
      active: true,
      tags: ['staff'],
      projectId: 'proj_missing_source',
      catalogSlotKey: 'slot-orphan',
      catalogSlotStartAt: new Date('2026-07-15T12:00:00.000Z'),
    });
    await (
      service as unknown as {
        sendNextTaskChecklistAsk: (
          contact: (typeof contacts.store)[0],
          slotKey: string,
        ) => Promise<void>;
      }
    ).sendNextTaskChecklistAsk(orphan, 'slot-orphan');
    expect(
      messages.store.filter(
        (row) => row.source === 'task_checklist' && row.phone === orphan.phone,
      ),
    ).toHaveLength(0);

    await sources.create({
      filename: 'empty.json',
      content: {
        tareas_con_objetivo: [{ id: 'x', label: 'done', avance_base: 100 }],
      },
    });
    await (
      service as unknown as {
        sendNextTaskChecklistAsk: (
          contact: (typeof contacts.store)[0],
          slotKey: string,
        ) => Promise<void>;
      }
    ).sendNextTaskChecklistAsk(lead, 'slot-b');
    expect(
      messages.store.filter((row) => row.source === 'task_checklist'),
    ).toHaveLength(0);
    expect(await service.listTaskChecklists({ slotKey: 'slot-b' })).toEqual([]);
  });

  it('isolates task checklist to the contact active project source only', async () => {
    const lead = await contacts.create({
      phone: '5491138911800',
      label: 'Benjamin',
      active: true,
      tags: ['staff'],
      projectId: ACTIVE_PROJECT,
      catalogSlotKey: 'slot-iso',
      catalogSlotStartAt: new Date('2026-07-15T12:00:00.000Z'),
    });
    await sources.create({
      filename: 'other.json',
      projectId: 'proj_other',
      content: {
        tareas_con_objetivo: [
          { id: 'wrong', label: 'otra obra', avance_base: 0 },
        ],
      },
    });
    await sources.create({
      filename: 'active.json',
      projectId: ACTIVE_PROJECT,
      content: {
        tareas_con_objetivo: [
          { id: 'right', label: 'obra activa', avance_base: 5 },
        ],
      },
    });
    await (
      service as unknown as {
        sendNextTaskChecklistAsk: (
          contact: (typeof contacts.store)[0],
          slotKey: string,
        ) => Promise<void>;
      }
    ).sendNextTaskChecklistAsk(lead, 'slot-iso');
    expect(sendInteractive).toHaveBeenCalledTimes(1);
    expect(
      (
        sendInteractive.mock.calls[0] as unknown as [string, { title?: string }]
      )[1].title,
    ).toBe(`${ACTIVE_PROJECT} · Tarea 1/1 · obra activa`);
    const ask = messages.store.find(
      (row) => row.source === 'task_checklist' && row.direction === 'outbound',
    );
    expect(ask?.projectId).toBe(ACTIVE_PROJECT);
    expect(ask?.taskId).toBe('right');
  });

  it('skips scheduled catalog for contacts outside the active project', async () => {
    const asOf = new Date('2026-07-15T12:00:00.000Z');
    await accounts.create({
      email: 'ops@example.com',
      activeProjectId: ACTIVE_PROJECT,
      emailNotificationSchedule: {
        enabled: true,
        frequency: 'weekly',
        daysOfWeek: [3],
        dayOfMonth: 1,
        sendTime: '09:00',
        timezone: 'America/Argentina/Buenos_Aires',
      },
    });
    const other = await contacts.create({
      phone: '5491111111199',
      label: 'Otra',
      active: true,
      tags: ['staff'],
      projectId: 'proj_other',
    });
    await catalog.create({
      title: 'Avance',
      body: '¿Cómo va?',
      assignedContactId: other._id,
      active: true,
    });
    const result = await service.runScheduledNotifications(asOf);
    expect(result.emailsSent).toBe(1);
    expect(result.catalogSent).toBe(0);
    expect(sendInteractive).not.toHaveBeenCalled();
  });

  it('falls back to latest source project and stamps legacy contacts', async () => {
    const asOf = new Date('2026-07-15T12:00:00.000Z');
    await accounts.create({
      email: 'ops@example.com',
      emailNotificationSchedule: {
        enabled: true,
        frequency: 'weekly',
        daysOfWeek: [3],
        dayOfMonth: 1,
        sendTime: '09:00',
        timezone: 'America/Argentina/Buenos_Aires',
      },
    });
    const legacy = await contacts.create({
      phone: '5491111111188',
      label: 'Legacy',
      active: true,
      tags: ['staff'],
    });
    await catalog.create({
      title: 'Avance',
      body: '¿Cómo va?',
      assignedContactId: legacy._id,
      active: true,
    });
    await sources.create({
      filename: 'obra.json',
      projectId: ACTIVE_PROJECT,
      content: { meta: { projectId: ACTIVE_PROJECT } },
    });

    const result = await service.runScheduledNotifications(asOf);
    expect(result.emailsSent).toBe(1);
    expect(result.catalogSent).toBe(1);
    expect(sendInteractive).toHaveBeenCalledTimes(1);
    expect(
      contacts.store.find((row) => String(row._id) === String(legacy._id))
        ?.projectId,
    ).toBe(ACTIVE_PROJECT);
  });

  it('includes multi-project contacts when any obra matches active', async () => {
    const asOf = new Date('2026-07-15T12:00:00.000Z');
    await accounts.create({
      email: 'ops@example.com',
      activeProjectId: ACTIVE_PROJECT,
      emailNotificationSchedule: {
        enabled: true,
        frequency: 'weekly',
        daysOfWeek: [3],
        dayOfMonth: 1,
        sendTime: '09:00',
        timezone: 'America/Argentina/Buenos_Aires',
      },
    });
    const multi = await contacts.create({
      phone: '5491111111177',
      label: 'Multi',
      active: true,
      tags: ['staff'],
      projectIds: ['proj_other', ACTIVE_PROJECT],
    });
    await catalog.create({
      title: 'Avance',
      body: '¿Cómo va?',
      assignedContactId: multi._id,
      active: true,
    });
    const result = await service.runScheduledNotifications(asOf);
    expect(result.catalogSent).toBe(1);
    expect(sendInteractive).toHaveBeenCalledTimes(1);
  });

  it('merges projectId into existing contact membership on update', async () => {
    const contact = await contacts.create({
      phone: '5491111111166',
      label: 'Merge',
      active: true,
      tags: ['staff'],
      projectIds: ['proj_a'],
      projectId: 'proj_a',
    });
    const updated = await service.updateContact(String(contact._id), {
      projectId: 'proj_b',
    });
    expect(normalizeContactProjectIds(updated)).toEqual(['proj_a', 'proj_b']);
  });

  it('merges project membership when createContact hits an existing phone', async () => {
    await contacts.create({
      phone: '5491111111155',
      label: 'Lead A',
      active: true,
      tags: ['staff'],
      projectIds: ['proj_a'],
      projectId: 'proj_a',
    });
    const merged = await service.createContact({
      phone: '5491111111155',
      label: 'Lead A+B',
      projectId: 'proj_b',
    });
    expect(normalizeContactProjectIds(merged)).toEqual(['proj_a', 'proj_b']);
    expect(merged.label).toBe('Lead A+B');
    expect(contacts.store).toHaveLength(1);
  });

  it('records failed outbound StaffMessage when Evolution send fails', async () => {
    const lead = await contacts.create({
      phone: '5491138911798',
      label: 'Benjamin',
      active: true,
      tags: ['staff'],
      projectId: ACTIVE_PROJECT,
      catalogSlotKey: 'slot-c',
      catalogSlotStartAt: new Date('2026-07-15T12:00:00.000Z'),
    });
    await sources.create({
      filename: 'obra.json',
      projectId: ACTIVE_PROJECT,
      content: {
        tareas_con_objetivo: [
          { id: 'carp', label: 'colocacion carpinterias', avance_base: 20 },
        ],
      },
    });
    sendInteractive.mockRejectedValueOnce(new Error('evolution down'));
    await (
      service as unknown as {
        sendNextTaskChecklistAsk: (
          contact: (typeof contacts.store)[0],
          slotKey: string,
        ) => Promise<void>;
      }
    ).sendNextTaskChecklistAsk(lead, 'slot-c');
    const failed = messages.store.find(
      (row) => row.source === 'task_checklist' && row.status === 'failed',
    );
    expect(failed?.taskId).toBe('carp');
  });
});
