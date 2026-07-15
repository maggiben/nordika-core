import { BadRequestException } from '@nestjs/common';
import { SourcesController } from './sources.controller';
import { SourcesService } from './sources.service';

describe('SourcesController', () => {
  const create = jest.fn();
  const sourcesService = { create } as unknown as SourcesService;
  const controller = new SourcesController(sourcesService);

  beforeEach(() => {
    create.mockReset();
  });

  it('parses an uploaded JSON file before saving it', async () => {
    const createdSource = {
      id: 'source-id',
      filename: 'source.json',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    create.mockResolvedValue(createdSource);

    await expect(controller.upload(jsonFile('{"enabled":true}'))).resolves.toEqual(
      createdSource,
    );
    expect(create).toHaveBeenCalledWith('source.json', { enabled: true });
  });

  it('rejects files with invalid JSON', async () => {
    await expect(controller.upload(jsonFile('{'))).rejects.toThrow(
      BadRequestException,
    );
  });

  function jsonFile(content: string) {
    return {
      originalname: 'source.json',
      buffer: Buffer.from(content),
      mimetype: 'application/json',
    };
  }
});
