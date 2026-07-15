import {
  Injectable,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { SOURCE_OF_TRUTH_MODEL, sourceOfTruthSchema } from './source.schema';
import type { SourceOfTruth } from './source.schema';
import type { Connection, Model } from 'mongoose';

export interface CreatedSource {
  id: string;
  filename: string;
  createdAt: Date;
}

@Injectable()
export class SourcesService {
  constructor(
    @Optional()
    @InjectConnection()
    private readonly connection: Connection | undefined,
  ) {}

  async create(filename: string, content: unknown): Promise<CreatedSource> {
    const sourceModel = this.getSourceModel();
    const source = await sourceModel.create({ filename, content });

    return {
      id: source.id,
      filename: source.filename,
      createdAt: source.createdAt,
    };
  }

  private getSourceModel(): Model<SourceOfTruth> {
    if (!this.connection) {
      throw new ServiceUnavailableException(
        'MongoDB is not configured for this service.',
      );
    }

    const existing = this.connection.models[SOURCE_OF_TRUTH_MODEL] as
      Model<SourceOfTruth> | undefined;

    return (
      existing ??
      this.connection.model<SourceOfTruth>(
        SOURCE_OF_TRUTH_MODEL,
        sourceOfTruthSchema,
      )
    );
  }
}
