import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { OptionalCacheService } from '../cache/optional-cache.service';
import { EvolutionClient } from './evolution.client';
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
        update: Partial<T>,
        options: { upsert?: boolean } = {},
      ) => ({
        exec: () => {
          const index = store.findIndex((item) => matches(item, filter));
          if (index < 0) {
            if (!options.upsert) {
              return Promise.resolve(null);
            }
            const created = {
              ...update,
              _id: new Types.ObjectId(),
            } as LeanDoc<T>;
            store.push(created);
            return Promise.resolve(created);
          }
          store[index] = { ...store[index], ...update };
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

function matches(
  item: Record<string, unknown>,
  filter: Record<string, unknown>,
): boolean {
  return Object.entries(filter).every(([key, value]) => {
    const left = item[key];
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
  }>();
  const catalog = createModelMock<{
    title: string;
    body: string;
    assignedContactId?: Types.ObjectId;
    active: boolean;
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
    ]) {
      model.store.length = 0;
      jest.clearAllMocks();
    }
    isConfigured.mockReset().mockReturnValue(true);
    sendInteractive
      .mockReset()
      .mockImplementation(() => Promise.resolve({ providerMessageId: '1' }));
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
      evolution,
      cache,
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
    expect(sendInteractive).toHaveBeenCalledWith(
      contact.phone,
      expect.objectContaining({
        text: 'Semana 2: 30% estructura',
        title: 'C1',
      }),
      'Semana 2: 30% estructura',
    );

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

  it('sends a test message and records outbound history', async () => {
    await templates.create({
      key: 'weekly_status',
      name: 'Weekly',
      format: 'interactive_v1',
      body: { text: 'Hi {{percent}}', title: '{{ciclo_name}}', widgets: [] },
      active: true,
    });
    const contact = await contacts.create({
      phone: '5491112345678',
      active: true,
      tags: ['staff'],
      label: 'PM',
    });

    const result = await service.sendTestMessage({
      phone: '+54 9 11 1234-5678',
      templateKey: 'weekly_status',
    });
    expect(result.ok).toBe(true);
    expect(messages.store).toHaveLength(1);
    expect(messages.store[0]).toMatchObject({
      contactId: contact._id,
      direction: 'outbound',
      status: 'sent',
      templateKey: 'weekly_status',
    });

    const roster = await service.listStaffRoster();
    expect(roster).toHaveLength(1);
    expect(roster[0]?.hasOutbound).toBe(true);
    expect(roster[0]?.lastTemplateKey).toBe('weekly_status');
  });

  it('records failed test sends and rejects missing templates', async () => {
    await templates.create({
      key: 'weekly_status',
      name: 'Weekly',
      format: 'interactive_v1',
      body: { text: 'Hi', widgets: [] },
      active: true,
    });
    await contacts.create({
      phone: '5491112345678',
      active: true,
      tags: ['staff'],
    });
    sendInteractive.mockImplementationOnce(() =>
      Promise.reject(new Error('send failed')),
    );
    await expect(
      service.sendTestMessage({
        phone: '5491112345678',
        templateKey: 'weekly_status',
      }),
    ).rejects.toThrow('send failed');
    expect(messages.store[0]?.status).toBe('failed');

    await expect(
      service.sendTestMessage({
        phone: '5491112345678',
        templateKey: 'missing',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    isConfigured.mockReturnValue(false);
    await expect(
      service.sendTestMessage({
        phone: '5491112345678',
        templateKey: 'weekly_status',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('reminds by resending the last outbound message', async () => {
    const contact = await contacts.create({
      phone: '5491112345678',
      active: true,
      tags: ['staff'],
      label: 'PM',
    });
    await messages.create({
      contactId: contact._id,
      phone: contact.phone,
      direction: 'outbound',
      templateKey: 'weekly_status',
      body: 'Previous message',
      status: 'sent',
      sentAt: new Date('2026-07-01T00:00:00Z'),
    });

    const result = await service.remindContact(String(contact._id));
    expect(result.renderedText).toBe('Previous message');
    expect(sendInteractive).toHaveBeenCalled();
    expect(messages.store.length).toBeGreaterThan(1);

    await expect(
      service.remindContact(new Types.ObjectId().toHexString()),
    ).rejects.toBeInstanceOf(NotFoundException);

    const empty = await contacts.create({
      phone: '5491199999999',
      active: true,
      tags: ['staff'],
    });
    await expect(
      service.remindContact(String(empty._id)),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('records inbound replies from Evolution payloads', async () => {
    const contact = await contacts.create({
      phone: '5491112345678',
      active: true,
      tags: ['staff'],
    });

    const extracted = service.extractInboundFromEvolution({
      data: {
        key: {
          remoteJid: '5491112345678@s.whatsapp.net',
          fromMe: false,
          id: 'm1',
        },
        message: { conversation: 'Ok listo' },
      },
    });
    expect(extracted).toMatchObject({
      phone: '5491112345678',
      body: 'Ok listo',
      providerMessageId: 'm1',
    });

    expect(
      service.extractInboundFromEvolution({
        data: {
          key: { fromMe: true, remoteJid: '5491112345678@s.whatsapp.net' },
        },
      }),
    ).toBeNull();

    const recorded = await service.recordInboundMessage({
      phone: '5491112345678',
      body: 'Ok listo',
    });
    expect(recorded.contactId).toBe(String(contact._id));
    expect(messages.store.some((item) => item.direction === 'inbound')).toBe(
      true,
    );

    const roster = await service.listStaffRoster();
    expect(roster[0]?.lastReceivedAt).toBeTruthy();

    await expect(
      service.recordInboundMessage({ phone: '5491100000000', text: 'hola' }),
    ).resolves.toMatchObject({ contactId: null });
  });

  it('creates catalog messages, assigns staff, and records precise reply latency', async () => {
    const contact = await contacts.create({
      phone: '5491112345678',
      active: true,
      tags: ['staff'],
      label: 'Estructura',
    });
    const catalogMessage = await service.createCatalogMessage({
      title: 'Pedido de avance',
      body: '¿Cómo va el sector estructurado esta semana?',
      assignedContactId: String(contact._id),
    });
    expect(catalogMessage.assignedLabel).toBe('Estructura');

    const sent = await service.sendCatalogMessage(catalogMessage._id, {});
    expect(sent.ok).toBe(true);
    expect(messages.store[0]?.title).toBe('Pedido de avance');
    expect(messages.store[0]?.body).toContain('sector estructurado');

    const replied = await service.recordInboundMessage({
      phone: '5491112345678',
      body: 'Vamos al 80%, sin desvíos.',
    });
    expect(replied.threadId).toBeTruthy();
    expect(typeof replied.responseLatencyMs).toBe('number');
    expect(replied.responseStatus).toBe('green');

    const listed = await service.listCatalogMessages();
    expect(listed[0]?.responseLatencyMs).not.toBeNull();
    expect(listed[0]?.repliedAt).toBeTruthy();
  });
});
