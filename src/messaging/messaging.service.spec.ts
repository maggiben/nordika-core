import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Types } from 'mongoose';
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
    create: jest.fn(async (doc: T) => {
      const created = { ...doc, _id: new Types.ObjectId() } as LeanDoc<T>;
      created.save = async () => created;
      store.push(created);
      return created;
    }),
    find: jest.fn((filter: Record<string, unknown> = {}) => ({
      sort: () => ({
        exec: async () =>
          store.filter((item) =>
            matches(item as Record<string, unknown>, filter),
          ),
        limit: () => ({
          exec: async () =>
            store.filter((item) =>
              matches(item as Record<string, unknown>, filter),
            ),
        }),
      }),
      exec: async () =>
        store.filter((item) => matches(item as Record<string, unknown>, filter)),
    })),
    findOne: jest.fn((filter: Record<string, unknown>) => ({
      exec: async () =>
        store.find((item) => matches(item as Record<string, unknown>, filter)) ??
        null,
    })),
    findById: jest.fn((id: Types.ObjectId) => ({
      exec: async () => {
        const found =
          store.find((item) => String(item._id) === String(id)) ?? null;
        if (found && !found.save) {
          found.save = async () => found;
        }
        return found;
      },
    })),
    findByIdAndUpdate: jest.fn(
      (id: Types.ObjectId, update: Partial<T>) => ({
        exec: async () => {
          const index = store.findIndex(
            (item) => String(item._id) === String(id),
          );
          if (index < 0) {
            return null;
          }
          store[index] = { ...store[index], ...update };
          return store[index];
        },
      }),
    ),
    findOneAndUpdate: jest.fn(
      (
        filter: Record<string, unknown>,
        update: Partial<T>,
        options: { upsert?: boolean } = {},
      ) => ({
        exec: async () => {
          const index = store.findIndex((item) =>
            matches(item as Record<string, unknown>, filter),
          );
          if (index < 0) {
            if (!options.upsert) {
              return null;
            }
            const created = {
              ...update,
              _id: new Types.ObjectId(),
            } as LeanDoc<T>;
            store.push(created);
            return created;
          }
          store[index] = { ...store[index], ...update };
          return store[index];
        },
      }),
    ),
    exists: jest.fn((filter: Record<string, unknown>) => ({
      exec: async () =>
        store.some((item) => matches(item as Record<string, unknown>, filter))
          ? { _id: new Types.ObjectId() }
          : null,
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

  const evolution = {
    isConfigured: jest.fn(() => true),
    sendInteractive: jest.fn(async () => ({ providerMessageId: '1' })),
  } as unknown as EvolutionClient;

  let service: MessagingService;

  beforeEach(() => {
    for (const model of [
      contacts,
      templates,
      ciclos,
      workStatuses,
      dispatches,
    ]) {
      model.store.length = 0;
      jest.clearAllMocks();
    }
    evolution.isConfigured = jest.fn(() => true);
    evolution.sendInteractive = jest.fn(async () => ({
      providerMessageId: '1',
    }));

    service = new MessagingService(
      contacts as never,
      templates as never,
      ciclos as never,
      workStatuses as never,
      dispatches as never,
      evolution,
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
          { type: 'button', id: 'a', label: 'A', action: 'url', url: 'https://x' },
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
    expect(evolution.sendInteractive).toHaveBeenCalledWith(
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
    evolution.sendInteractive = jest.fn(async () => {
      throw new Error('boom');
    });

    const summaries = await service.runWeeklyStatusDispatch(
      new Date('2026-07-01T12:00:00Z'),
    );
    expect(summaries[0]?.failed).toBe(1);
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
    evolution.isConfigured = jest.fn(() => false);
    await expect(service.runWeeklyStatusDispatch()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
