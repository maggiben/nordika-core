import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { Connection, Model } from 'mongoose';
import {
  MESSAGING_CACHE_PATHS,
  SOURCES_CACHE_PATHS,
} from '../cache/cache.constants';
import { OptionalCacheService } from '../cache/optional-cache.service';
import {
  STAFF_MESSAGE_MODEL,
  WHATSAPP_CONTACT_MODEL,
  staffMessageSchema,
  whatsAppContactSchema,
  type StaffMessage,
  type WhatsAppContact,
} from '../messaging/messaging.schema';
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

type ContactLean = {
  _id: { toString(): string };
  projectIds?: string[];
  projectId?: string | null;
};

/** Future dedicated progress collections (if registered on the connection). */
const PARSED_PROGRESS_MODEL_CANDIDATES = [
  'ParsedProgress',
  'StaffParsedProgress',
  'ObraParsedProgress',
] as const;

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
    const sourceFilter = {
      $or: [{ projectId: trimmed }, { 'content.meta.projectId': trimmed }],
    };

    // Confirm the project exists before wiping progress (avoid typo wipe).
    const matchingSources = await sourceModel
      .countDocuments(sourceFilter)
      .exec();
    if (matchingSources < 1) {
      throw new NotFoundException('Project source not found.');
    }

    // Fail-closed: clear progress first so a later source delete failure
    // still leaves no WhatsApp / obra advance for this projectId.
    try {
      await this.clearProjectProgress(trimmed);
    } catch (error) {
      const detail =
        error instanceof Error
          ? error.message
          : 'Unknown progress cleanup error';
      throw new InternalServerErrorException(
        `Could not clear progress for project ${trimmed}: ${detail}`,
      );
    }

    const result = await sourceModel.deleteMany(sourceFilter).exec();
    const deletedCount = result.deletedCount ?? 0;

    if (deletedCount < 1) {
      throw new InternalServerErrorException(
        `Progress was cleared for ${trimmed}, but sources could not be deleted.`,
      );
    }

    await this.cache.invalidatePaths([
      SOURCES_CACHE_PATHS.list,
      MESSAGING_CACHE_PATHS.progress(trimmed),
      MESSAGING_CACHE_PATHS.progress(),
      MESSAGING_CACHE_PATHS.roster,
      MESSAGING_CACHE_PATHS.contacts,
      MESSAGING_CACHE_PATHS.catalog,
      MESSAGING_CACHE_PATHS.taskChecklist,
    ]);

    return { projectId: trimmed, deletedCount };
  }

  /**
   * Wipe WhatsApp / messaging history for this obra:
   * - StaffMessages stamped with the projectId
   * - StaffMessages tied to this obra's SourceOfTruth rows (sourceId)
   * - All StaffMessages for leads whose only obra was this one (covers legacy
   *   rows missing projectId)
   * Then strip project membership from contacts.
   */
  private async clearProjectProgress(projectId: string): Promise<void> {
    const sourceModel = this.getSourceModel();
    const messageModel = this.getStaffMessageModel();
    const contactModel = this.getContactModel();

    const sourceFilter = {
      $or: [{ projectId }, { 'content.meta.projectId': projectId }],
    };
    const sources = (await sourceModel
      .find(sourceFilter)
      .select('_id')
      .lean()
      .exec()) as Array<{ _id: unknown }>;
    const sourceIds = sources.map((row) => row._id);

    const contacts = (await contactModel
      .find({
        $or: [{ projectIds: projectId }, { projectId }],
      })
      .lean()
      .exec()) as ContactLean[];

    const soleContactIds = contacts
      .filter((contact) => remainingProjectIds(contact, projectId).length === 0)
      .map((contact) => contact._id);

    const messageClauses: Record<string, unknown>[] = [{ projectId }];
    if (sourceIds.length > 0) {
      messageClauses.push({ sourceId: { $in: sourceIds } });
    }
    if (soleContactIds.length > 0) {
      messageClauses.push({ contactId: { $in: soleContactIds } });
    }

    await messageModel.deleteMany({ $or: messageClauses }).exec();

    await this.clearDedicatedParsedProgress(projectId);

    for (const contact of contacts) {
      const nextIds = remainingProjectIds(contact, projectId);
      const patch: Record<string, unknown> = {
        projectIds: nextIds,
        projectId: nextIds[0] ?? null,
      };
      if (nextIds.length === 0) {
        patch.catalogSlotKey = null;
        patch.catalogSlotStartAt = null;
      }
      await contactModel
        .updateOne({ _id: contact._id }, { $set: patch })
        .exec();
    }
  }

  private async clearDedicatedParsedProgress(projectId: string): Promise<void> {
    if (!this.connection) {
      return;
    }
    for (const name of PARSED_PROGRESS_MODEL_CANDIDATES) {
      const existing = this.connection.models[name] as
        | Model<{
            projectId?: string;
          }>
        | undefined;
      if (!existing) {
        continue;
      }
      await existing.deleteMany({ projectId }).exec();
    }
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

  private getStaffMessageModel(): Model<StaffMessage> {
    if (!this.connection) {
      throw new ServiceUnavailableException(
        'MongoDB is not configured for this service.',
      );
    }
    const existing = this.connection.models[STAFF_MESSAGE_MODEL] as
      Model<StaffMessage> | undefined;
    return (
      existing ??
      this.connection.model<StaffMessage>(
        STAFF_MESSAGE_MODEL,
        staffMessageSchema,
      )
    );
  }

  private getContactModel(): Model<WhatsAppContact> {
    if (!this.connection) {
      throw new ServiceUnavailableException(
        'MongoDB is not configured for this service.',
      );
    }
    const existing = this.connection.models[WHATSAPP_CONTACT_MODEL] as
      Model<WhatsAppContact> | undefined;
    return (
      existing ??
      this.connection.model<WhatsAppContact>(
        WHATSAPP_CONTACT_MODEL,
        whatsAppContactSchema,
      )
    );
  }
}

function sourceTimestamp(row: SourceDocument): number {
  return row.createdAt?.getTime() ?? row._id.getTimestamp().getTime();
}

function remainingProjectIds(
  contact: ContactLean,
  removedProjectId: string,
): string[] {
  const fromList = (contact.projectIds ?? [])
    .map((id) => (typeof id === 'string' ? id.trim() : ''))
    .filter((id) => id.length > 0 && id !== removedProjectId);
  const legacy = contact.projectId?.trim();
  if (legacy && legacy !== removedProjectId && !fromList.includes(legacy)) {
    fromList.push(legacy);
  }
  return [...new Set(fromList)];
}
