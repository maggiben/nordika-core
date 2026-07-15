import {
  Injectable,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { Connection, Model } from 'mongoose';
import { projectIdFromSnapshotContent } from './project-id';
import { SOURCE_OF_TRUTH_MODEL, sourceOfTruthSchema } from './source.schema';
import type { SourceOfTruth } from './source.schema';

export interface CreatedSource {
  id: string;
  filename: string;
  createdAt: Date;
  projectId: string | null;
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
    const projectId = projectIdFromSnapshotContent(content);
    const source = await sourceModel.create({
      filename,
      content,
      ...(projectId ? { projectId } : {}),
    });

    return {
      id: source.id,
      filename: source.filename,
      createdAt: source.createdAt,
      projectId: source.projectId ?? null,
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
