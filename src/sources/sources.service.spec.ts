import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { Connection } from 'mongoose';
import { SourcesService } from './sources.service';

describe('SourcesService', () => {
  it('stores the parsed JSON and returns source metadata', async () => {
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    const create = jest.fn().mockResolvedValue({
      id: 'source-id',
      filename: 'source.json',
      createdAt,
      projectId: 'proj_1',
    });
    const sourceModel = { create };
    const model = jest.fn().mockReturnValue(sourceModel);
    const connection = { model, models: {} } as unknown as Connection;
    const service = new SourcesService(connection);

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
    const model = jest.fn().mockReturnValue(sourceModel);
    const connection = { model, models: {} } as unknown as Connection;
    const service = new SourcesService(connection);

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

  it('deletes all sources for a projectId', async () => {
    const deleteMany = jest.fn().mockReturnValue({
      exec: () => Promise.resolve({ deletedCount: 2 }),
    });
    const sourceModel = { deleteMany };
    const model = jest.fn().mockReturnValue(sourceModel);
    const connection = { model, models: {} } as unknown as Connection;
    const service = new SourcesService(connection);

    await expect(service.deleteByProjectId('proj_a')).resolves.toEqual({
      projectId: 'proj_a',
      deletedCount: 2,
    });
    expect(deleteMany).toHaveBeenCalledWith({ projectId: 'proj_a' });
  });

  it('rejects delete when no sources match the projectId', async () => {
    const deleteMany = jest.fn().mockReturnValue({
      exec: () => Promise.resolve({ deletedCount: 0 }),
    });
    const sourceModel = { deleteMany };
    const model = jest.fn().mockReturnValue(sourceModel);
    const connection = { model, models: {} } as unknown as Connection;
    const service = new SourcesService(connection);

    await expect(service.deleteByProjectId('missing')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('reports when MongoDB is unavailable', async () => {
    const service = new SourcesService(undefined);

    await expect(service.create('source.json', {})).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
});
