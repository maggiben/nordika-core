import {
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { Connection, Model } from 'mongoose';
import { SOURCES_CACHE_PATHS } from '../cache/cache.constants';
import { OptionalCacheService } from '../cache/optional-cache.service';
import {
  projectIdFromSnapshotContent,
  projectNombreFromSnapshotContent,
} from './project-id';
import { SOURCE_OF_TRUTH_MODEL, sourceOfTruthSchema } from './source.schema';
import type { SourceOfTruth } from './source.schema';

export interface CreatedSource {
  id: string;
  filename: string;
  createdAt: Date;
  projectId: string | null;
}

export interface ListedSource {
  id: string;
  projectId: string;
  name: string;
  filename: string;
  createdAt: Date;
  content: unknown;
}

export interface DeletedProjectSources {
  projectId: string;
  deletedCount: number;
}

type SourceDocument = SourceOfTruth & {
  _id: { toString(): string; getTimestamp(): Date };
  id?: string;
  createdAt?: Date;
};

@Injectable()
export class SourcesService {
  constructor(
    @Optional()
    @InjectConnection()
    private readonly connection: Connection | undefined,
    private readonly cache: OptionalCacheService,
  ) {}

  async create(filename: string, content: unknown): Promise<CreatedSource> {
    const sourceModel = this.getSourceModel();
    const projectId = projectIdFromSnapshotContent(content);
    const source = await sourceModel.create({
      filename,
      content,
      ...(projectId ? { projectId } : {}),
    });

    await this.cache.invalidatePaths([SOURCES_CACHE_PATHS.list]);

    return {
      id: source.id,
      filename: source.filename,
      createdAt: source.createdAt,
      projectId: source.projectId ?? null,
    };
  }

  async listLatestPerProject(): Promise<ListedSource[]> {
    const sourceModel = this.getSourceModel();
    const rows = (await sourceModel
      .find({
        projectId: { $exists: true, $nin: [null, ''] },
      })
      .lean()
      .exec()) as SourceDocument[];

    const latestByProject = new Map<string, SourceDocument>();
    for (const row of rows) {
      const projectId = row.projectId?.trim();
      if (!projectId) {
        continue;
      }
      const existing = latestByProject.get(projectId);
      if (!existing || sourceTimestamp(row) > sourceTimestamp(existing)) {
        latestByProject.set(projectId, row);
      }
    }

    return [...latestByProject.entries()]
      .map(([projectId, row]) => ({
        id: row.id ?? row._id.toString(),
        projectId,
        name: projectNombreFromSnapshotContent(row.content) ?? projectId,
        filename: row.filename,
        createdAt: row.createdAt ?? row._id.getTimestamp(),
        content: row.content,
      }))
      .sort(
        (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
      );
  }

  async deleteByProjectId(projectId: string): Promise<DeletedProjectSources> {
    const trimmed = projectId.trim();
    if (!trimmed) {
      throw new NotFoundException('Project source not found.');
    }

    const sourceModel = this.getSourceModel();
    // Match top-level projectId and legacy rows that only stamped meta.projectId.
    const result = await sourceModel
      .deleteMany({
        $or: [{ projectId: trimmed }, { 'content.meta.projectId': trimmed }],
      })
      .exec();
    const deletedCount = result.deletedCount ?? 0;

    if (deletedCount < 1) {
      throw new NotFoundException('Project source not found.');
    }

    await this.cache.invalidatePaths([SOURCES_CACHE_PATHS.list]);

    return { projectId: trimmed, deletedCount };
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

function sourceTimestamp(row: SourceDocument): number {
  return row.createdAt?.getTime() ?? row._id.getTimestamp().getTime();
}
