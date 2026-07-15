import { ServiceUnavailableException } from '@nestjs/common';
import type { Connection } from 'mongoose';
import { SourcesService } from './sources.service';

describe('SourcesService', () => {
  it('stores the parsed JSON and returns source metadata', async () => {
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    const create = jest.fn().mockResolvedValue({
      id: 'source-id',
      filename: 'source.json',
      createdAt,
    });
    const sourceModel = { create };
    const model = jest.fn().mockReturnValue(sourceModel);
    const connection = { model, models: {} } as unknown as Connection;
    const service = new SourcesService(connection);

    await expect(
      service.create('source.json', { enabled: true }),
    ).resolves.toEqual({
      id: 'source-id',
      filename: 'source.json',
      createdAt,
    });
    expect(create).toHaveBeenCalledWith({
      content: { enabled: true },
      filename: 'source.json',
    });
  });

  it('reports when MongoDB is unavailable', async () => {
    const service = new SourcesService(undefined);

    await expect(service.create('source.json', {})).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
});
