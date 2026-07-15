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
import { FLOW_STEP_CAP } from './messaging.flow-match';
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
    findByIdAndUpdate: jest.fn((id: Types.ObjectId, update: Partial<T>) => ({
      exec: () => {
        const index = store.findIndex(
          (item) => String(item._id) === String(id),
        );
        if (index < 0) {
          return Promise.resolve(null);
        }
        store[index] = { ...store[index], ...update };
        return Promise.resolve(store[index]);
      },
    })),
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
    }
    if (left instanceof Types.ObjectId || value instanceof Types.ObjectId) {
      return String(left) === String(value);
    }
    return left === value;
  });
}

describe('MessagingService', () => {
  const contacts = createModelMock<{
    phone: string;
    label?: string;
    active: boolean;
    tags: string[];
    language?: string;
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
    flowId?: Types.ObjectId;
    flowRunId?: Types.ObjectId;
    flowNodeId?: string;
    threadId?: Types.ObjectId;
    title?: string;
    source?: string;
  }>();
  const catalog = createModelMock<{
    title: string;
    body: string;
    assignedContactId?: Types.ObjectId;
    active: boolean;
  }>();
  const flows = createModelMock<{
    name: string;
    active: boolean;
    startNodeId: string;
    nodes: Array<{
      id: string;
      title: string;
      body: string;
      position: { x: number; y: number };
    }>;
    edges: Array<{
      id: string;
      fromNodeId: string;
      toNodeId: string;
      match: { type: 'equals' | 'contains'; value: string };
    }>;
  }>();
  const flowRuns = createModelMock<{
    flowId: Types.ObjectId;
    contactId: Types.ObjectId;
    currentNodeId: string;
    status: string;
    stepCount: number;
    lastOutboundMessageId?: Types.ObjectId;
  }>();
  const accounts = createModelMock<{
    email: string;
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
      flows,
      flowRuns,
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
      flows as never,
      flowRuns as never,
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

  it('records email failures and skips WhatsApp when Evolution is off', async () => {
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
      active: true,
    });
    sendInteractive.mockRejectedValueOnce(new Error('boom'));
    const result = await service.sendAssignedCatalogMessages();
    expect(result.failed).toBe(1);
    expect(result.sent).toBe(0);
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
  });

  it('starts a flow, advances on matching reply, and rejects a second active run', async () => {
    const contact = await contacts.create({
      phone: '5491199887766',
      label: 'Jefe',
      active: true,
      tags: ['staff'],
      language: 'es',
    });
    const flow = await flows.create({
      name: 'Asistencia',
      active: true,
      startNodeId: 'ask',
      nodes: [
        {
          id: 'ask',
          title: 'Asistencia',
          body: '¿Cómo fue?',
          position: { x: 0, y: 0 },
        },
        {
          id: 'thanks',
          title: 'Gracias',
          body: 'Recibido',
          position: { x: 200, y: 0 },
        },
      ],
      edges: [
        {
          id: 'e1',
          fromNodeId: 'ask',
          toNodeId: 'thanks',
          match: { type: 'equals', value: 'día completo' },
        },
      ],
    });

    const listed = await service.listFlows();
    expect(listed.some((item) => item._id === String(flow._id))).toBe(true);
    expect((await service.getFlow(String(flow._id))).name).toBe('Asistencia');

    const created = await service.createFlow({
      name: 'Nuevo',
      startNodeId: 'n1',
      nodes: [
        {
          id: 'n1',
          title: 'Hola',
          body: 'Mensaje',
          position: { x: 0, y: 0 },
        },
      ],
      edges: [],
    });
    expect(created.name).toBe('Nuevo');

    const updated = await service.updateFlow(String(flow._id), {
      name: 'Asistencia v2',
      active: true,
      startNodeId: 'ask',
      nodes: flow.nodes,
      edges: flow.edges,
    });
    expect(updated.name).toBe('Asistencia v2');

    const deactivated = await service.updateFlow(String(flow._id), {
      name: 'Asistencia v2',
      active: false,
      startNodeId: 'ask',
      nodes: flow.nodes,
      edges: flow.edges,
    });
    expect(deactivated.active).toBe(false);
    await expect(
      service.startFlow(String(flow._id), {
        contactId: String(contact._id),
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await service.updateFlow(String(flow._id), {
      name: 'Asistencia v2',
      active: true,
      startNodeId: 'ask',
      nodes: flow.nodes,
      edges: flow.edges,
    });

    const started = await service.startFlow(String(flow._id), {
      contactId: String(contact._id),
    });
    expect(started.ok).toBe(true);
    expect(sendInteractive).toHaveBeenCalledTimes(1);
    expect(flowRuns.store[0]?.status).toBe('awaiting_reply');
    expect(messages.store[0]?.source).toBe('flow');

    const runs = await service.listFlowRuns(String(contact._id));
    expect(runs).toHaveLength(1);
    expect((await service.getFlowRun(String(runs[0]._id))).status).toBe(
      'awaiting_reply',
    );

    await expect(
      service.startFlow(String(flow._id), {
        contactId: String(contact._id),
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    await service.recordInboundMessage({
      phone: contact.phone,
      body: 'Día Completo',
    });
    expect(sendInteractive).toHaveBeenCalledTimes(2);
    expect(flowRuns.store[0]?.currentNodeId).toBe('thanks');
    expect(flowRuns.store[0]?.status).toBe('completed');
    expect(flowRuns.store[0]?.stepCount).toBe(2);

    await service.deleteFlow(String(created._id));
    expect((await service.getFlow(String(created._id))).active).toBe(false);
  });

  it('keeps awaiting_reply when reply does not match and fails at step cap', async () => {
    const contact = await contacts.create({
      phone: '5491100112233',
      label: 'Jefe 2',
      active: true,
      tags: ['staff'],
      language: 'es',
    });
    const flow = await flows.create({
      name: 'Loop',
      active: true,
      startNodeId: 'a',
      nodes: [
        {
          id: 'a',
          title: 'A',
          body: 'A?',
          position: { x: 0, y: 0 },
        },
        {
          id: 'b',
          title: 'B',
          body: 'B',
          position: { x: 100, y: 0 },
        },
      ],
      edges: [
        {
          id: 'e1',
          fromNodeId: 'a',
          toNodeId: 'b',
          match: { type: 'contains', value: 'si' },
        },
      ],
    });

    await service.startFlow(String(flow._id), {
      contactId: String(contact._id),
    });
    const sendCountAfterStart = sendInteractive.mock.calls.length;

    await service.recordInboundMessage({
      phone: contact.phone,
      body: 'no',
    });
    expect(sendInteractive.mock.calls.length).toBe(sendCountAfterStart);
    expect(flowRuns.store[0]?.status).toBe('awaiting_reply');

    flowRuns.store[0].stepCount = FLOW_STEP_CAP;
    messages.store[0].repliedAt = undefined;
    messages.store[0].replyBody = undefined;

    await service.recordInboundMessage({
      phone: contact.phone,
      body: 'si dale',
    });
    expect(sendInteractive.mock.calls.length).toBe(sendCountAfterStart);
    expect(flowRuns.store[0]?.status).toBe('failed');
  });

  it('rejects missing flow resources and unconfigured messaging for start', async () => {
    const missing = new Types.ObjectId().toHexString();
    await expect(service.getFlow(missing)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      service.updateFlow(missing, {
        name: 'x',
        startNodeId: 'a',
        nodes: [
          {
            id: 'a',
            title: 'A',
            body: 'B',
            position: { x: 0, y: 0 },
          },
        ],
        edges: [],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.deleteFlow(missing)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.getFlowRun(missing)).rejects.toBeInstanceOf(
      NotFoundException,
    );

    const inactive = await flows.create({
      name: 'off',
      active: false,
      startNodeId: 'a',
      nodes: [
        {
          id: 'a',
          title: 'A',
          body: 'B',
          position: { x: 0, y: 0 },
        },
      ],
      edges: [],
    });
    const contact = await contacts.create({
      phone: '5491177665544',
      active: true,
      tags: ['staff'],
    });
    await expect(
      service.startFlow(String(inactive._id), {
        contactId: String(contact._id),
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    isConfigured.mockReturnValue(false);
    const active = await flows.create({
      name: 'on',
      active: true,
      startNodeId: 'a',
      nodes: [
        {
          id: 'a',
          title: 'A',
          body: 'B',
          position: { x: 0, y: 0 },
        },
      ],
      edges: [],
    });
    await expect(
      service.startFlow(String(active._id), {
        contactId: String(contact._id),
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('completes immediately for single-node flows and marks failed on send errors', async () => {
    isConfigured.mockReturnValue(true);
    const contact = await contacts.create({
      phone: '5491166554433',
      active: true,
      tags: ['staff'],
      language: 'es',
    });
    const flow = await flows.create({
      name: 'One shot',
      active: true,
      startNodeId: 'only',
      nodes: [
        {
          id: 'only',
          title: 'Solo',
          body: 'Listo',
          position: { x: 0, y: 0 },
        },
      ],
      edges: [],
    });

    const started = await service.startFlow(String(flow._id), {
      contactId: String(contact._id),
    });
    expect(started.ok).toBe(true);
    expect(flowRuns.store[0]?.status).toBe('completed');

    const contact2 = await contacts.create({
      phone: '5491155443322',
      active: true,
      tags: ['staff'],
      language: 'es',
    });
    sendInteractive.mockRejectedValueOnce(new Error('boom'));
    await expect(
      service.startFlow(String(flow._id), {
        contactId: String(contact2._id),
      }),
    ).rejects.toThrow('boom');
    expect(flowRuns.store.some((run) => run.status === 'failed')).toBe(true);

    const inactiveContact = await contacts.create({
      phone: '5491144332211',
      active: false,
      tags: ['staff'],
    });
    await expect(
      service.startFlow(String(flow._id), {
        contactId: String(inactiveContact._id),
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    await expect(
      service.createFlow({
        name: 'bad',
        startNodeId: 'missing',
        nodes: [
          {
            id: 'a',
            title: 'A',
            body: 'B',
            position: { x: 0, y: 0 },
          },
        ],
        edges: [],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const openRuns = await service.listFlowRuns();
    expect(Array.isArray(openRuns)).toBe(true);
  });
});
