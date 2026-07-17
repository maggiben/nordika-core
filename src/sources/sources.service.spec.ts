import {
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Connection } from 'mongoose';
import { OptionalCacheService } from '../cache/optional-cache.service';
import { SourcesService } from './sources.service';

describe('SourcesService', () => {
  const invalidatePaths = jest.fn(() => Promise.resolve());
  const cache = { invalidatePaths } as unknown as OptionalCacheService;

  beforeEach(() => {
    invalidatePaths.mockClear();
  });

  function connectionWithModels(models: {
    source: Record<string, unknown>;
    message?: Record<string, unknown>;
    contact?: Record<string, unknown>;
  }): Connection {
    const messageModel = models.message ?? {
      deleteMany: jest.fn().mockReturnValue({
        exec: () => Promise.resolve({ deletedCount: 0 }),
      }),
    };
    const contactModel = models.contact ?? {
      find: jest.fn().mockReturnValue({
        lean: () => ({
          exec: () => Promise.resolve([]),
        }),
      }),
      updateOne: jest.fn().mockReturnValue({
        exec: () => Promise.resolve({ modifiedCount: 0 }),
      }),
    };
    const model = jest.fn((name: string) => {
      if (name === 'SourceOfTruth') {
        return models.source;
      }
      if (name === 'StaffMessage') {
        return messageModel;
      }
      if (name === 'WhatsAppContact') {
        return contactModel;
      }
      return models.source;
    });
    return { model, models: {} } as unknown as Connection;
  }

  it('stores the parsed JSON and returns source metadata', async () => {
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    const create = jest.fn().mockResolvedValue({
      id: 'source-id',
      filename: 'source.json',
      createdAt,
      projectId: 'proj_1',
    });
    const sourceModel = { create };
    const service = new SourcesService(
      connectionWithModels({ source: sourceModel }),
      cache,
    );

    await expect(
      service.create('source.json', {
        meta: { projectId: 'proj_1' },
        enabled: true,
      }),
    ).resolves.toEqual({
      id: 'source-id',
      filename: 'source.json',
      createdAt,
      projectId: 'proj_1',
    });
    expect(create).toHaveBeenCalledWith({
      content: { meta: { projectId: 'proj_1' }, enabled: true },
      filename: 'source.json',
      projectId: 'proj_1',
    });
    expect(invalidatePaths).toHaveBeenCalledWith(['/sources']);
  });

  it('lists the newest source per projectId and skips missing ids', async () => {
    const find = jest.fn().mockReturnValue({
      lean: () => ({
        exec: () => [
          {
            _id: {
              toString: () => 'old-a',
              getTimestamp: () => new Date('2026-01-01T00:00:00.000Z'),
            },
            filename: 'a-old.json',
            projectId: 'proj_a',
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
            content: { meta: { projectId: 'proj_a', projectNombre: 'Alpha' } },
          },
          {
            _id: {
              toString: () => 'new-a',
              getTimestamp: () => new Date('2026-02-01T00:00:00.000Z'),
            },
            filename: 'a-new.json',
            projectId: 'proj_a',
            createdAt: new Date('2026-02-01T00:00:00.000Z'),
            content: {
              meta: { projectId: 'proj_a', projectNombre: 'Alpha Next' },
            },
          },
          {
            _id: {
              toString: () => 'only-b',
              getTimestamp: () => new Date('2026-01-15T00:00:00.000Z'),
            },
            filename: 'b.json',
            projectId: 'proj_b',
            createdAt: new Date('2026-01-15T00:00:00.000Z'),
            content: { meta: { projectId: 'proj_b', projectNombre: 'Beta' } },
          },
          {
            _id: {
              toString: () => 'no-project',
              getTimestamp: () => new Date('2026-03-01T00:00:00.000Z'),
            },
            filename: 'orphan.json',
            content: { meta: {} },
          },
        ],
      }),
    });
    const sourceModel = { find };
    const service = new SourcesService(
      connectionWithModels({ source: sourceModel }),
      cache,
    );

    await expect(service.listLatestPerProject()).resolves.toEqual([
      {
        id: 'new-a',
        projectId: 'proj_a',
        name: 'Alpha Next',
        filename: 'a-new.json',
        createdAt: new Date('2026-02-01T00:00:00.000Z'),
        content: {
          meta: { projectId: 'proj_a', projectNombre: 'Alpha Next' },
        },
      },
      {
        id: 'only-b',
        projectId: 'proj_b',
        name: 'Beta',
        filename: 'b.json',
        createdAt: new Date('2026-01-15T00:00:00.000Z'),
        content: { meta: { projectId: 'proj_b', projectNombre: 'Beta' } },
      },
    ]);
  });

  it('deletes sources and clears messaging progress for a projectId', async () => {
    const sourceIdA = { toString: () => 'src_a' };
    const countDocuments = jest.fn().mockReturnValue({
      exec: () => Promise.resolve(2),
    });
    const findSources = jest.fn().mockReturnValue({
      select: () => ({
        lean: () => ({
          exec: () => Promise.resolve([{ _id: sourceIdA }]),
        }),
      }),
    });
    const deleteManySources = jest.fn().mockReturnValue({
      exec: () => Promise.resolve({ deletedCount: 2 }),
    });
    const deleteManyMessages = jest.fn().mockReturnValue({
      exec: () => Promise.resolve({ deletedCount: 5 }),
    });
    const updateOne = jest.fn().mockReturnValue({
      exec: () => Promise.resolve({ modifiedCount: 1 }),
    });
    const contactIdKeep = { toString: () => 'contact_1' };
    const contactIdClear = { toString: () => 'contact_2' };
    const findContacts = jest.fn().mockReturnValue({
      lean: () => ({
        exec: () =>
          Promise.resolve([
            {
              _id: contactIdKeep,
              projectIds: ['proj_a', 'proj_b'],
              projectId: 'proj_a',
            },
            {
              _id: contactIdClear,
              projectIds: ['proj_a'],
              projectId: 'proj_a',
            },
          ]),
      }),
    });
    const sourceModel = {
      countDocuments,
      find: findSources,
      deleteMany: deleteManySources,
    };
    const messageModel = { deleteMany: deleteManyMessages };
    const contactModel = { find: findContacts, updateOne };
    const service = new SourcesService(
      connectionWithModels({
        source: sourceModel,
        message: messageModel,
        contact: contactModel,
      }),
      cache,
    );

    await expect(service.deleteByProjectId('proj_a')).resolves.toEqual({
      projectId: 'proj_a',
      deletedCount: 2,
    });
    expect(deleteManyMessages).toHaveBeenCalledWith({
      $or: [
        { projectId: 'proj_a' },
        { sourceId: { $in: [sourceIdA] } },
        { contactId: { $in: [contactIdClear] } },
      ],
    });
    expect(updateOne).toHaveBeenCalledWith(
      { _id: contactIdKeep },
      {
        $set: {
          projectIds: ['proj_b'],
          projectId: 'proj_b',
        },
      },
    );
    expect(updateOne).toHaveBeenCalledWith(
      { _id: contactIdClear },
      {
        $set: {
          projectIds: [],
          projectId: null,
          catalogSlotKey: null,
          catalogSlotStartAt: null,
        },
      },
    );
    expect(deleteManySources).toHaveBeenCalledWith({
      $or: [{ projectId: 'proj_a' }, { 'content.meta.projectId': 'proj_a' }],
    });
    expect(invalidatePaths).toHaveBeenCalledWith(
      expect.arrayContaining([
        '/sources',
        '/messaging/progress?projectId=proj_a',
        '/messaging/progress',
        '/messaging/roster',
        '/messaging/contacts',
        '/messaging/catalog',
        '/messaging/task-checklist',
      ]),
    );
  });

  it('rejects delete when no sources match the projectId', async () => {
    const countDocuments = jest.fn().mockReturnValue({
      exec: () => Promise.resolve(0),
    });
    const deleteMany = jest.fn();
    const sourceModel = { countDocuments, deleteMany };
    const service = new SourcesService(
      connectionWithModels({ source: sourceModel }),
      cache,
    );

    await expect(service.deleteByProjectId('missing')).rejects.toThrow(
      NotFoundException,
    );
    expect(deleteMany).not.toHaveBeenCalled();
    expect(invalidatePaths).not.toHaveBeenCalled();
  });

  it('fails closed when progress cleanup throws', async () => {
    const countDocuments = jest.fn().mockReturnValue({
      exec: () => Promise.resolve(1),
    });
    const deleteManySources = jest.fn();
    const deleteManyMessages = jest.fn().mockReturnValue({
      exec: () => Promise.reject(new Error('mongo down')),
    });
    const service = new SourcesService(
      connectionWithModels({
        source: { countDocuments, deleteMany: deleteManySources },
        message: { deleteMany: deleteManyMessages },
      }),
      cache,
    );

    await expect(service.deleteByProjectId('proj_a')).rejects.toThrow(
      InternalServerErrorException,
    );
    expect(deleteManySources).not.toHaveBeenCalled();
    expect(invalidatePaths).not.toHaveBeenCalled();
  });

  it('reports when MongoDB is unavailable', async () => {
    const service = new SourcesService(undefined, cache);

    await expect(service.create('source.json', {})).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
});
