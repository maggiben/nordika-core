import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Resend } from 'resend';
import {
  calendarDateInTimeZone,
  isScheduleDueAt,
  normalizeSchedule,
  notificationSlotKey,
  catalogSlotStartsAt,
} from '../account/schedule';
import {
  normalizeProgressAi,
  type ProgressAiSettings,
} from '../account/progress-ai';
import { ACCOUNT_MODEL, AccountDocument } from '../auth/auth.schema';
import { MESSAGING_CACHE_PATHS } from '../cache/cache.constants';
import { OptionalCacheService } from '../cache/optional-cache.service';
import {
  getAuthConfig,
  getWhatsAppDefaultLanguage,
} from '../config/environment';
import { LocaleService } from '../i18n/locale.service';
import { normalizeLanguage } from '../i18n/languages';
import { projectNombreFromSnapshotContent } from '../sources/project-id';
import {
  SOURCE_OF_TRUTH_MODEL,
  type SourceOfTruth,
} from '../sources/source.schema';
import { EvolutionClient } from './evolution.client';
import {
  CreateCatalogMessageDto,
  CreateCicloDto,
  CreateContactDto,
  CreateTemplateDto,
  InboundMessageDto,
  SendCatalogMessageDto,
  TestSendDto,
  UpdateCatalogMessageDto,
  UpdateCicloDto,
  UpdateContactDto,
  UpdateTemplateDto,
  UpsertWorkStatusDto,
} from './messaging.dto';
import {
  CICLO_MODEL,
  CicloDocument,
  InteractiveTemplateBody,
  MESSAGE_DISPATCH_MODEL,
  MESSAGE_TEMPLATE_MODEL,
  MessageDispatch,
  MessageDispatchDocument,
  MessageTemplate,
  MessageTemplateDocument,
  ADELANTO_CATALOG_TAG,
  STAFF_CATALOG_MESSAGE_MODEL,
  STAFF_MESSAGE_MODEL,
  StaffCatalogMessageDocument,
  StaffMessage,
  StaffMessageDocument,
  StaffParsedProgress,
  TemplateWidget,
  WHATSAPP_CONTACT_MODEL,
  WORK_STATUS_MODEL,
  WhatsAppContactDocument,
  WorkStatusDocument,
  type StaffOrgReport,
} from './messaging.schema';
import { extractPendingObjectiveTasks } from './pending-objective-tasks';

function normalizeCatalogTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) {
    return [];
  }
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of tags) {
    if (typeof raw !== 'string') {
      continue;
    }
    const tag = raw.trim().toLowerCase();
    if (!tag || seen.has(tag)) {
      continue;
    }
    seen.add(tag);
    result.push(tag);
  }
  return result;
}

function isAdelantoCatalogMessage(
  item: Pick<StaffCatalogMessageDocument, 'tags'>,
): boolean {
  return normalizeCatalogTags(item.tags).includes(ADELANTO_CATALOG_TAG);
}
import {
  contactBelongsToAnyProject,
  mergeContactProjectIds,
  normalizeContactProjectIds,
} from './contact-project-ids';
import { normalizeOrgReports } from './org-reports';
import { ProgressParseService } from './progress-parse.service';
import {
  computeResponseLatencyMs,
  responseStatusFromLatencyMs,
  responseStatusWhileWaiting,
  type StaffResponseTrafficLight,
} from './staff-response-metrics';
import {
  computeWeekNumber,
  formatDateOnly,
  isDateWithinCiclo,
  renderTemplateText,
} from './template.renderer';

export type ObraProgressRole = 'jefe_obra' | 'operario' | 'jornalero' | 'otro';

const OBRA_PROGRESS_ROLES: ObraProgressRole[] = [
  'jefe_obra',
  'operario',
  'jornalero',
  'otro',
];

export interface ObraProgressReport {
  contactId: string;
  contactLabel: string | null;
  contactPhone: string | null;
  role: ObraProgressRole;
  taskId: string | null;
  percent: number;
  duration: string | null;
  avance: string | null;
  notes: string | null;
  repliedAt: string;
  messageId: string;
}

export interface ObraProgressSummary {
  projectId: string;
  overallPercent: number | null;
  byRole: {
    jefe_obra: number | null;
    operario: number | null;
    jornalero: number | null;
    otro: number | null;
  };
  reports: ObraProgressReport[];
  updatedAt: string | null;
}

export interface WeeklyDispatchSummary {
  cicloId: string;
  weekNumber: number;
  sent: number;
  failed: number;
  skipped: number;
}

export interface StaffRosterRow {
  _id: string;
  phone: string;
  label?: string;
  active: boolean;
  tags: string[];
  projectId?: string | null;
  projectIds?: string[];
  orgReports: StaffOrgReport[];
  lastSentAt: string | null;
  lastReceivedAt: string | null;
  lastTemplateKey: string | null;
  messageTypes: string[];
  hasOutbound: boolean;
}

export interface StaffCatalogRow {
  _id: string;
  title: string;
  body: string;
  assignedContactId: string | null;
  assignedLabel: string | null;
  assignedPhone: string | null;
  sortOrder: number;
  active: boolean;
  tags: string[];
  lastSentAt: string | null;
  repliedAt: string | null;
  responseLatencyMs: number | null;
  responseStatus: string;
}

export interface TaskChecklistRow {
  _id: string;
  sourceId: string | null;
  taskId: string;
  taskLabel: string;
  contactId: string;
  phone: string;
  slotKey: string | null;
  askedAt: string;
  answeredAt: string | null;
  replyBody: string | null;
  inboundMessageId: string | null;
  status: 'pending' | 'answered' | 'failed';
}

@Injectable()
export class MessagingService {
  private readonly logger = new Logger(MessagingService.name);
  private readonly replyMatchWindowMs = 7 * 24 * 60 * 60 * 1000;
  private readonly catalogReminderMinIntervalMs = 60 * 60 * 1000;
  private readonly resend = new Resend(getAuthConfig().resendApiKey);
  private readonly resendFrom = getAuthConfig().resendFrom;

  constructor(
    @InjectModel(WHATSAPP_CONTACT_MODEL)
    private readonly contacts: Model<WhatsAppContactDocument>,
    @InjectModel(MESSAGE_TEMPLATE_MODEL)
    private readonly templates: Model<MessageTemplateDocument>,
    @InjectModel(CICLO_MODEL)
    private readonly ciclos: Model<CicloDocument>,
    @InjectModel(WORK_STATUS_MODEL)
    private readonly workStatuses: Model<WorkStatusDocument>,
    @InjectModel(MESSAGE_DISPATCH_MODEL)
    private readonly dispatches: Model<MessageDispatchDocument>,
    @InjectModel(STAFF_MESSAGE_MODEL)
    private readonly messages: Model<StaffMessageDocument>,
    @InjectModel(STAFF_CATALOG_MESSAGE_MODEL)
    private readonly catalog: Model<StaffCatalogMessageDocument>,
    @InjectModel(SOURCE_OF_TRUTH_MODEL)
    private readonly sources: Model<SourceOfTruth & { _id: Types.ObjectId }>,
    @InjectModel(ACCOUNT_MODEL)
    private readonly accounts: Model<AccountDocument>,
    private readonly evolution: EvolutionClient,
    private readonly cache: OptionalCacheService,
    private readonly locales: LocaleService,
    private readonly progressParse: ProgressParseService,
  ) {}

  normalizePhone(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 8 || digits.length > 20) {
      throw new BadRequestException(
        'phone must contain 8–20 digits (E.164 without +).',
      );
    }
    return digits;
  }

  async createContact(dto: CreateContactDto): Promise<WhatsAppContactDocument> {
    const phone = this.normalizePhone(dto.phone);
    // Also merge AR WhatsApp variants (54911… vs 5411…) so multi-obra
    // staffing does not create a second contact that never gets replies.
    const existing = await this.findContactByPhone(phone);
    if (existing) {
      if (existing.phone !== phone) {
        const previousPhone = existing.phone;
        await this.contacts
          .findByIdAndUpdate(existing._id, { phone, active: true })
          .exec();
        existing.phone = phone;
        existing.active = true;
        this.logger.warn(
          `Normalized contact phone ${previousPhone} → ${phone}`,
        );
      }
      await this.deactivatePhoneVariantDuplicates(existing, phone);
      const membershipPatch =
        dto.projectId !== undefined || dto.projectIds !== undefined
          ? {
              projectIds: mergeContactProjectIds(
                normalizeContactProjectIds(existing),
                dto.projectIds,
                dto.projectId,
              ),
            }
          : {};
      return this.updateContact(String(existing._id), {
        ...(dto.label !== undefined ? { label: dto.label } : {}),
        ...(dto.language !== undefined ? { language: dto.language } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
        ...(dto.tags !== undefined ? { tags: dto.tags } : {}),
        ...membershipPatch,
        ...(dto.orgReports !== undefined ? { orgReports: dto.orgReports } : {}),
      });
    }

    const projectIds = mergeContactProjectIds(dto.projectIds, dto.projectId);
    const orgReports =
      dto.orgReports !== undefined
        ? normalizeOrgReports(dto.orgReports)
        : undefined;
    const contact = await this.contacts.create({
      phone,
      label: dto.label,
      language: normalizeLanguage(dto.language, getWhatsAppDefaultLanguage()),
      active: dto.active ?? true,
      tags: dto.tags ?? ['staff'],
      ...(projectIds.length > 0
        ? { projectIds, projectId: projectIds[0] }
        : {}),
      ...(orgReports !== undefined ? { orgReports } : {}),
    });
    await this.cache.invalidatePaths([
      MESSAGING_CACHE_PATHS.contacts,
      MESSAGING_CACHE_PATHS.roster,
    ]);
    return contact;
  }

  async listContacts(): Promise<WhatsAppContactDocument[]> {
    return this.contacts.find().sort({ createdAt: -1 }).exec();
  }

  async updateContact(
    id: string,
    dto: UpdateContactDto,
  ): Promise<WhatsAppContactDocument> {
    const existing = await this.contacts
      .findById(this.toObjectId(id, 'contact'))
      .exec();
    if (!existing) {
      throw new NotFoundException('Contact not found.');
    }

    const patch: Record<string, unknown> = {};
    if (dto.label !== undefined) {
      patch.label = dto.label;
    }
    if (dto.language !== undefined) {
      patch.language = normalizeLanguage(
        dto.language,
        getWhatsAppDefaultLanguage(),
      );
    }
    if (dto.active !== undefined) {
      patch.active = dto.active;
    }
    if (dto.tags !== undefined) {
      patch.tags = dto.tags;
    }
    if (dto.projectIds !== undefined) {
      const projectIds = mergeContactProjectIds(dto.projectIds);
      patch.projectIds = projectIds;
      patch.projectId = projectIds[0] ?? null;
    } else if (dto.projectId !== undefined) {
      const projectIds = mergeContactProjectIds(
        normalizeContactProjectIds(existing),
        dto.projectId,
      );
      patch.projectIds = projectIds;
      if (projectIds.length > 0) {
        patch.projectId = projectIds[0];
      }
    }
    if (dto.orgReports !== undefined) {
      patch.orgReports = normalizeOrgReports(dto.orgReports);
    }

    const contact = await this.contacts
      .findByIdAndUpdate(this.toObjectId(id, 'contact'), patch, {
        new: true,
        runValidators: true,
      })
      .exec();
    if (!contact) {
      throw new NotFoundException('Contact not found.');
    }
    await this.cache.invalidatePaths([
      MESSAGING_CACHE_PATHS.contacts,
      MESSAGING_CACHE_PATHS.roster,
    ]);
    return contact;
  }

  async createTemplate(
    dto: CreateTemplateDto,
  ): Promise<MessageTemplateDocument> {
    const body = this.validateTemplateBody(dto.body);
    const template = await this.templates.create({
      key: dto.key.trim(),
      name: dto.name.trim(),
      description: dto.description,
      format: 'interactive_v1',
      body,
      active: dto.active ?? true,
    });
    await this.cache.invalidatePaths([MESSAGING_CACHE_PATHS.templates]);
    return template;
  }

  async listTemplates(language?: string): Promise<
    Array<{
      key: string;
      name: string;
      description?: string;
      format: 'interactive_v1';
      language: string;
      source: 'locale' | 'database';
      body: InteractiveTemplateBody;
      active: boolean;
    }>
  > {
    const lang = normalizeLanguage(language, getWhatsAppDefaultLanguage());
    const fromFiles = this.locales.listTemplates(lang).map((template) => ({
      key: template.key,
      name: template.name,
      description: template.description,
      format: 'interactive_v1' as const,
      language: template.language,
      source: 'locale' as const,
      body: this.locales.toInteractiveBody(template),
      active: true,
    }));

    const fromDb = await this.templates.find().sort({ createdAt: -1 }).exec();
    const fileKeys = new Set(fromFiles.map((template) => template.key));
    const extras = fromDb
      .filter((template) => !fileKeys.has(template.key))
      .map((template) => ({
        key: template.key,
        name: template.name,
        description: template.description,
        format: 'interactive_v1' as const,
        language: lang,
        source: 'database' as const,
        body: template.body,
        active: template.active,
      }));

    return [...fromFiles, ...extras];
  }

  async updateTemplate(
    key: string,
    dto: UpdateTemplateDto,
  ): Promise<MessageTemplateDocument> {
    const update: Partial<MessageTemplate> = {};
    if (dto.name !== undefined) {
      update.name = dto.name.trim();
    }
    if (dto.description !== undefined) {
      update.description = dto.description;
    }
    if (dto.active !== undefined) {
      update.active = dto.active;
    }
    if (dto.body !== undefined) {
      update.body = this.validateTemplateBody(dto.body);
    }

    const template = await this.templates
      .findOneAndUpdate({ key }, update, { new: true, runValidators: true })
      .exec();
    if (!template) {
      throw new NotFoundException('Template not found.');
    }
    await this.cache.invalidatePaths([MESSAGING_CACHE_PATHS.templates]);
    return template;
  }

  async createCiclo(dto: CreateCicloDto): Promise<CicloDocument> {
    const inicio = new Date(dto.ciclo_inicio);
    const fin = new Date(dto.ciclo_fin);
    if (Number.isNaN(inicio.getTime()) || Number.isNaN(fin.getTime())) {
      throw new BadRequestException('Invalid ciclo_inicio or ciclo_fin.');
    }
    if (fin.getTime() < inicio.getTime()) {
      throw new BadRequestException(
        'ciclo_fin must be on or after ciclo_inicio.',
      );
    }

    await this.assertTemplateExists(dto.templateKey);

    const ciclo = await this.ciclos.create({
      name: dto.name.trim(),
      ciclo_inicio: inicio,
      ciclo_fin: fin,
      templateKey: dto.templateKey,
      active: dto.active ?? true,
    });
    await this.cache.invalidatePaths([MESSAGING_CACHE_PATHS.ciclos]);
    return ciclo;
  }

  async listCiclos(): Promise<CicloDocument[]> {
    return this.ciclos.find().sort({ ciclo_inicio: -1 }).exec();
  }

  async updateCiclo(id: string, dto: UpdateCicloDto): Promise<CicloDocument> {
    const existing = await this.ciclos
      .findById(this.toObjectId(id, 'ciclo'))
      .exec();
    if (!existing) {
      throw new NotFoundException('Ciclo not found.');
    }

    if (dto.templateKey) {
      await this.assertTemplateExists(dto.templateKey);
      existing.templateKey = dto.templateKey;
    }
    if (dto.name !== undefined) {
      existing.name = dto.name.trim();
    }
    if (dto.ciclo_inicio !== undefined) {
      existing.ciclo_inicio = new Date(dto.ciclo_inicio);
    }
    if (dto.ciclo_fin !== undefined) {
      existing.ciclo_fin = new Date(dto.ciclo_fin);
    }
    if (dto.active !== undefined) {
      existing.active = dto.active;
    }
    if (existing.ciclo_fin.getTime() < existing.ciclo_inicio.getTime()) {
      throw new BadRequestException(
        'ciclo_fin must be on or after ciclo_inicio.',
      );
    }

    const saved = await existing.save();
    await this.cache.invalidatePaths([MESSAGING_CACHE_PATHS.ciclos]);
    return saved;
  }

  async upsertWorkStatus(
    dto: UpsertWorkStatusDto,
  ): Promise<WorkStatusDocument> {
    const cicloId = this.toObjectId(dto.cicloId, 'ciclo');
    const ciclo = await this.ciclos.findById(cicloId).exec();
    if (!ciclo) {
      throw new NotFoundException('Ciclo not found.');
    }

    const status = await this.workStatuses
      .findOneAndUpdate(
        { cicloId, weekNumber: dto.weekNumber },
        {
          cicloId,
          weekNumber: dto.weekNumber,
          percent: dto.percent,
          duration: dto.duration,
          avance: dto.avance,
          notes: dto.notes,
          asOf: dto.asOf ? new Date(dto.asOf) : new Date(),
        },
        {
          upsert: true,
          new: true,
          runValidators: true,
          setDefaultsOnInsert: true,
        },
      )
      .exec();
    await this.cache.invalidatePaths([
      MESSAGING_CACHE_PATHS.workStatus(),
      MESSAGING_CACHE_PATHS.workStatus(dto.cicloId),
    ]);
    return status;
  }

  async listWorkStatuses(cicloId?: string): Promise<WorkStatusDocument[]> {
    const filter = cicloId
      ? { cicloId: this.toObjectId(cicloId, 'ciclo') }
      : {};
    return this.workStatuses.find(filter).sort({ asOf: -1 }).exec();
  }

  async listDispatches(cicloId?: string): Promise<MessageDispatchDocument[]> {
    const filter = cicloId
      ? { cicloId: this.toObjectId(cicloId, 'ciclo') }
      : {};
    return this.dispatches
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(200)
      .exec();
  }

  async listObraProgress(projectId: string): Promise<ObraProgressSummary> {
    const trimmed = projectId?.trim();
    if (!trimmed) {
      throw new BadRequestException('projectId query parameter is required.');
    }

    const rows = (
      await this.messages
        .find({
          projectId: trimmed,
          direction: 'outbound',
          parsedProgress: { $exists: true },
        })
        .sort({ repliedAt: -1 })
        .exec()
    )
      .slice()
      .sort((a, b) => {
        const aTime =
          (a.repliedAt ?? a.parsedProgress?.parsedAt)?.getTime() ?? 0;
        const bTime =
          (b.repliedAt ?? b.parsedProgress?.parsedAt)?.getTime() ?? 0;
        return bTime - aTime;
      });

    const latestByKey = new Map<string, StaffMessageDocument>();
    for (const row of rows) {
      if (!row.parsedProgress) {
        continue;
      }
      const key = `${String(row.contactId)}::${row.taskId ?? ''}`;
      if (!latestByKey.has(key)) {
        latestByKey.set(key, row);
      }
    }

    const latestRows = [...latestByKey.values()];
    const contactById = new Map<string, WhatsAppContactDocument>();
    for (const row of latestRows) {
      const contactId = String(row.contactId);
      if (contactById.has(contactId)) {
        continue;
      }
      const contact = await this.contacts.findById(row.contactId).exec();
      if (contact) {
        contactById.set(contactId, contact);
      }
    }

    const roleBuckets: Record<ObraProgressRole, number[]> = {
      jefe_obra: [],
      operario: [],
      jornalero: [],
      otro: [],
    };
    const reports: ObraProgressReport[] = [];
    let latestUpdatedMs: number | null = null;

    for (const row of latestRows) {
      const progress = row.parsedProgress as StaffParsedProgress;
      const contact = contactById.get(String(row.contactId));
      const role = resolveContactProgressRole(contact?.tags ?? []);
      const repliedAt = row.repliedAt ?? progress.parsedAt ?? new Date(0);
      const repliedAtIso = repliedAt.toISOString();
      const updatedMs = repliedAt.getTime();
      if (latestUpdatedMs === null || updatedMs > latestUpdatedMs) {
        latestUpdatedMs = updatedMs;
      }

      reports.push({
        contactId: String(row.contactId),
        contactLabel: contact?.label?.trim() ? contact.label.trim() : null,
        contactPhone: contact?.phone?.trim() ? contact.phone.trim() : null,
        role,
        taskId: row.taskId?.trim() ? row.taskId : null,
        percent: progress.percent,
        duration: progress.duration ?? null,
        avance: progress.avance ?? null,
        notes: progress.notes ?? null,
        repliedAt: repliedAtIso,
        messageId: String(row._id),
      });

      accumulateRolePercents(roleBuckets, progress);
    }

    reports.sort((a, b) => b.repliedAt.localeCompare(a.repliedAt));

    // Overall % must reflect task-scoped asks only. Catalog/obra replies without
    // taskId used to pull the aggregate to 100% while every task row stayed at 0%.
    const taskPercents = reports
      .filter((report) => report.taskId)
      .map((report) => report.percent);
    const overallPercent =
      taskPercents.length === 0 ? null : average(taskPercents);

    return {
      projectId: trimmed,
      overallPercent,
      byRole: {
        jefe_obra: averageOrNull(roleBuckets.jefe_obra),
        operario: averageOrNull(roleBuckets.operario),
        jornalero: averageOrNull(roleBuckets.jornalero),
        otro: averageOrNull(roleBuckets.otro),
      },
      reports,
      updatedAt:
        latestUpdatedMs === null
          ? null
          : new Date(latestUpdatedMs).toISOString(),
    };
  }

  async sendTestMessage(dto: TestSendDto): Promise<{
    ok: true;
    phone: string;
    templateKey: string | null;
    renderedText: string;
    providerMessageId?: string;
  }> {
    if (!this.evolution.isConfigured()) {
      throw new ServiceUnavailableException(
        'WhatsApp delivery is not configured.',
      );
    }

    const phone = this.normalizePhone(dto.phone);
    const language = normalizeLanguage(
      dto.language,
      getWhatsAppDefaultLanguage(),
    );
    const freeText = dto.text?.trim();
    if (freeText) {
      return this.sendFreeTextTestMessage({
        phone,
        text: freeText,
        language,
      });
    }

    const templateKey = dto.templateKey?.trim();
    if (!templateKey) {
      throw new BadRequestException(
        'Provide either text or templateKey for test-send.',
      );
    }

    const body = await this.resolveTemplateBody(templateKey, language);
    if (!body) {
      throw new NotFoundException(`Template ${templateKey} was not found.`);
    }

    const variables = {
      percent: dto.percent ?? '72',
      duration: dto.duration ?? '3 semanas',
      avance: dto.avance ?? 'Estructura avanzada',
      notes: dto.notes ?? 'Mensaje de prueba',
      week: dto.week ?? '3',
      ciclo_name: dto.ciclo_name ?? 'Ciclo de prueba',
      ciclo_inicio: dto.ciclo_inicio ?? '2026-01-01',
      ciclo_fin: dto.ciclo_fin ?? '2026-03-31',
    };

    const renderedText = renderTemplateText(body.text, variables);
    const renderedBody: InteractiveTemplateBody = {
      ...body,
      text: renderedText,
      title: body.title
        ? renderTemplateText(body.title, variables)
        : body.title,
    };

    const contact = await this.contacts.findOne({ phone }).exec();

    try {
      const result = await this.evolution.sendInteractive(
        phone,
        renderedBody,
        renderedText,
        language,
      );

      if (contact) {
        await this.recordStaffMessage({
          contactId: contact._id,
          phone,
          direction: 'outbound',
          templateKey,
          body: renderedText,
          status: 'sent',
          providerMessageId: result.providerMessageId,
          sentAt: new Date(),
          receivedAt: new Date(),
          responseStatus: 'pending',
          source: 'test',
        });
      }

      return {
        ok: true,
        phone,
        templateKey,
        renderedText,
        providerMessageId: result.providerMessageId,
      };
    } catch (error) {
      if (contact) {
        const message =
          error instanceof Error ? error.message : 'Unknown send error';
        await this.recordStaffMessage({
          contactId: contact._id,
          phone,
          direction: 'outbound',
          templateKey,
          body: renderedText,
          status: 'failed',
          error: message,
          sentAt: new Date(),
          source: 'test',
          responseStatus: 'neutral',
        });
      }
      throw error;
    }
  }

  private async sendFreeTextTestMessage(input: {
    phone: string;
    text: string;
    language: string;
  }): Promise<{
    ok: true;
    phone: string;
    templateKey: null;
    renderedText: string;
    providerMessageId?: string;
  }> {
    const { phone, text, language } = input;
    const renderedBody: InteractiveTemplateBody = {
      text,
      widgets: [],
    };
    const contact = await this.contacts.findOne({ phone }).exec();

    try {
      const result = await this.evolution.sendInteractive(
        phone,
        renderedBody,
        text,
        language,
      );

      if (contact) {
        await this.recordStaffMessage({
          contactId: contact._id,
          phone,
          direction: 'outbound',
          title: 'Performance check-in',
          body: text,
          status: 'sent',
          providerMessageId: result.providerMessageId,
          sentAt: new Date(),
          receivedAt: new Date(),
          responseStatus: 'pending',
          source: 'test',
        });
      }

      return {
        ok: true,
        phone,
        templateKey: null,
        renderedText: text,
        providerMessageId: result.providerMessageId,
      };
    } catch (error) {
      if (contact) {
        const message =
          error instanceof Error ? error.message : 'Unknown send error';
        await this.recordStaffMessage({
          contactId: contact._id,
          phone,
          direction: 'outbound',
          title: 'Performance check-in',
          body: text,
          status: 'failed',
          error: message,
          sentAt: new Date(),
          source: 'test',
          responseStatus: 'neutral',
        });
      }
      throw error;
    }
  }

  async listStaffRoster(): Promise<StaffRosterRow[]> {
    const contacts = await this.contacts.find({ active: true }).exec();
    const staff = contacts.filter((contact) => {
      const tags = contact.tags ?? [];
      // Legacy contacts without tags are treated as staff for the roster UI.
      return tags.length === 0 || tags.includes('staff');
    });

    const rows: StaffRosterRow[] = [];
    for (const contact of staff) {
      const outbound = await this.messages
        .find({
          contactId: contact._id,
          direction: 'outbound',
          status: 'sent',
        })
        .sort({ sentAt: -1, createdAt: -1 })
        .limit(50)
        .exec();
      const inbound = await this.messages
        .find({
          contactId: contact._id,
          direction: 'inbound',
        })
        .sort({ receivedAt: -1, createdAt: -1 })
        .limit(1)
        .exec();

      const lastOutbound = outbound[0] ?? null;
      const lastInbound = inbound[0] ?? null;
      const messageTypes = [
        ...new Set(
          outbound
            .map((item) => item.templateKey)
            .filter((key): key is string => Boolean(key)),
        ),
      ];

      rows.push({
        _id: String(contact._id),
        phone: contact.phone,
        label: contact.label,
        active: contact.active,
        tags: contact.tags ?? [],
        projectIds: normalizeContactProjectIds(contact),
        projectId: normalizeContactProjectIds(contact)[0] ?? null,
        orgReports: normalizeOrgReports(contact.orgReports),
        lastSentAt: lastOutbound?.sentAt
          ? lastOutbound.sentAt.toISOString()
          : null,
        lastReceivedAt: lastInbound?.receivedAt
          ? lastInbound.receivedAt.toISOString()
          : null,
        lastTemplateKey: lastOutbound?.templateKey ?? null,
        messageTypes,
        hasOutbound: Boolean(lastOutbound),
      });
    }

    return rows.sort((a, b) =>
      (a.label ?? a.phone).localeCompare(b.label ?? b.phone),
    );
  }

  async remindContact(contactId: string): Promise<{
    ok: true;
    phone: string;
    templateKey: string | null;
    renderedText: string;
    providerMessageId?: string;
  }> {
    if (!this.evolution.isConfigured()) {
      throw new ServiceUnavailableException(
        'WhatsApp delivery is not configured.',
      );
    }

    const contact = await this.contacts
      .findById(this.toObjectId(contactId, 'contact'))
      .exec();
    if (!contact || !contact.active) {
      throw new NotFoundException('Contact not found.');
    }

    const lastOutbound = await this.messages
      .find({
        contactId: contact._id,
        direction: 'outbound',
        status: 'sent',
      })
      .sort({ sentAt: -1, createdAt: -1 })
      .limit(1)
      .exec();
    const previous = lastOutbound[0];
    if (!previous?.body?.trim()) {
      throw new NotFoundException(
        'No previous outbound message to resend for this contact.',
      );
    }

    const body: InteractiveTemplateBody = {
      text: previous.body,
      widgets: [],
    };
    const language = normalizeLanguage(
      contact.language,
      getWhatsAppDefaultLanguage(),
    );

    try {
      const result = await this.evolution.sendInteractive(
        contact.phone,
        body,
        previous.body,
        language,
      );
      await this.recordStaffMessage({
        contactId: contact._id,
        phone: contact.phone,
        direction: 'outbound',
        templateKey: previous.templateKey,
        body: previous.body,
        status: 'sent',
        providerMessageId: result.providerMessageId,
        sentAt: new Date(),
        receivedAt: new Date(),
        responseStatus: 'pending',
        source: 'remind',
      });
      return {
        ok: true,
        phone: contact.phone,
        templateKey: previous.templateKey ?? null,
        renderedText: previous.body,
        providerMessageId: result.providerMessageId,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown send error';
      await this.recordStaffMessage({
        contactId: contact._id,
        phone: contact.phone,
        direction: 'outbound',
        templateKey: previous.templateKey,
        body: previous.body,
        status: 'failed',
        error: message,
        sentAt: new Date(),
        source: 'remind',
        responseStatus: 'neutral',
      });
      throw error;
    }
  }

  async createCatalogMessage(
    dto: CreateCatalogMessageDto,
  ): Promise<StaffCatalogRow> {
    const assignedContactId = dto.assignedContactId?.trim()
      ? this.toObjectId(dto.assignedContactId, 'contact')
      : undefined;
    if (assignedContactId) {
      const contact = await this.contacts.findById(assignedContactId).exec();
      if (!contact) {
        throw new NotFoundException('Assigned contact not found.');
      }
    }
    const sortOrder = assignedContactId
      ? await this.nextCatalogSortOrder(assignedContactId)
      : 0;
    const created = await this.catalog.create({
      title: dto.title.trim(),
      body: dto.body,
      assignedContactId,
      sortOrder,
      active: dto.active ?? true,
      tags: normalizeCatalogTags(dto.tags),
    });
    await this.cache.invalidatePaths([MESSAGING_CACHE_PATHS.catalog]);
    return this.toCatalogRow(created);
  }

  async listCatalogMessages(): Promise<StaffCatalogRow[]> {
    const items = await this.catalog.find({ active: true }).exec();
    await this.backfillCatalogSortOrders(items);
    items.sort((left, right) => {
      const leftKey = left.assignedContactId
        ? String(left.assignedContactId)
        : '';
      const rightKey = right.assignedContactId
        ? String(right.assignedContactId)
        : '';
      if (leftKey !== rightKey) {
        if (!leftKey) {
          return 1;
        }
        if (!rightKey) {
          return -1;
        }
        return leftKey.localeCompare(rightKey);
      }
      return (left.sortOrder ?? 0) - (right.sortOrder ?? 0);
    });
    const rows: StaffCatalogRow[] = [];
    for (const item of items) {
      rows.push(await this.toCatalogRow(item));
    }
    return rows;
  }

  async updateCatalogMessage(
    id: string,
    dto: UpdateCatalogMessageDto,
  ): Promise<StaffCatalogRow> {
    const doc = await this.catalog
      .findById(this.toObjectId(id, 'catalog message'))
      .exec();
    if (!doc) {
      throw new NotFoundException('Catalog message not found.');
    }
    if (dto.title !== undefined) {
      doc.title = dto.title.trim();
    }
    if (dto.body !== undefined) {
      doc.body = dto.body;
    }
    if (dto.active !== undefined) {
      doc.active = dto.active;
    }
    if (dto.tags !== undefined) {
      doc.tags = normalizeCatalogTags(dto.tags);
    }
    if (dto.assignedContactId !== undefined) {
      const previousAssignee = doc.assignedContactId
        ? String(doc.assignedContactId)
        : null;
      if (!dto.assignedContactId.trim()) {
        doc.assignedContactId = undefined;
        doc.sortOrder = 0;
      } else {
        const nextId = this.toObjectId(dto.assignedContactId, 'contact');
        doc.assignedContactId = nextId;
        if (previousAssignee !== String(nextId)) {
          doc.sortOrder = await this.nextCatalogSortOrder(nextId);
        }
      }
      if (doc.save) {
        await doc.save();
      }
      if (
        previousAssignee &&
        previousAssignee !== String(doc.assignedContactId ?? '')
      ) {
        await this.renumberCatalogBucket(
          this.toObjectId(previousAssignee, 'contact'),
        );
      }
    } else if (doc.save) {
      await doc.save();
    }
    await this.cache.invalidatePaths([MESSAGING_CACHE_PATHS.catalog]);
    return this.toCatalogRow(doc);
  }

  async assignCatalogMessage(
    id: string,
    contactId: string,
  ): Promise<StaffCatalogRow> {
    return this.updateCatalogMessage(id, { assignedContactId: contactId });
  }

  async reorderCatalogMessages(dto: {
    contactId: string;
    orderedIds: string[];
  }): Promise<StaffCatalogRow[]> {
    const contactOid = this.toObjectId(dto.contactId, 'contact');
    const contact = await this.contacts.findById(contactOid).exec();
    if (!contact) {
      throw new NotFoundException('Contact not found.');
    }
    const orderedIds = dto.orderedIds.map((id) => id.trim()).filter(Boolean);
    if (orderedIds.length === 0) {
      throw new BadRequestException('orderedIds must not be empty.');
    }
    const unique = new Set(orderedIds);
    if (unique.size !== orderedIds.length) {
      throw new BadRequestException('orderedIds must be unique.');
    }
    const siblings = await this.catalog
      .find({ active: true, assignedContactId: contactOid })
      .exec();
    if (siblings.length !== orderedIds.length) {
      throw new BadRequestException(
        'orderedIds must include every active message for this contact.',
      );
    }
    const byId = new Map(siblings.map((item) => [String(item._id), item]));
    for (const id of orderedIds) {
      if (!byId.has(id)) {
        throw new BadRequestException(
          `Catalog message ${id} is not assigned to this contact.`,
        );
      }
    }
    for (let index = 0; index < orderedIds.length; index += 1) {
      const item = byId.get(orderedIds[index])!;
      item.sortOrder = index + 1;
      await item.save();
    }
    await this.cache.invalidatePaths([MESSAGING_CACHE_PATHS.catalog]);
    return this.listCatalogMessages();
  }

  /**
   * Clear catalog reply state for a lead so the sequence restarts at step 1.
   * Does not delete outbound history — only reopens answered steps.
   */
  async resetCatalogSequence(contactId: string): Promise<{
    ok: true;
    reset: number;
  }> {
    const contactOid = this.toObjectId(contactId, 'contact');
    const contact = await this.contacts.findById(contactOid).exec();
    if (!contact) {
      throw new NotFoundException('Contact not found.');
    }
    const result = await this.messages
      .updateMany(
        {
          contactId: contactOid,
          direction: 'outbound',
          source: 'catalog',
          repliedAt: { $exists: true },
        },
        {
          $unset: { repliedAt: 1, replyBody: 1, responseLatencyMs: 1 },
          $set: { responseStatus: 'pending' },
        },
      )
      .exec();
    await this.cache.invalidatePaths([MESSAGING_CACHE_PATHS.catalog]);
    return { ok: true, reset: result.modifiedCount ?? 0 };
  }

  async deleteCatalogMessage(id: string): Promise<{ ok: true }> {
    const doc = await this.catalog
      .findById(this.toObjectId(id, 'catalog message'))
      .exec();
    if (!doc || !doc.active) {
      throw new NotFoundException('Catalog message not found.');
    }
    const previousAssignee = doc.assignedContactId
      ? String(doc.assignedContactId)
      : null;
    doc.active = false;
    doc.sortOrder = 0;
    if (doc.save) {
      await doc.save();
    }
    if (previousAssignee) {
      await this.renumberCatalogBucket(
        this.toObjectId(previousAssignee, 'contact'),
      );
    }
    await this.cache.invalidatePaths([MESSAGING_CACHE_PATHS.catalog]);
    return { ok: true };
  }

  async sendCatalogMessage(
    id: string,
    dto: SendCatalogMessageDto = {},
    options: { catalogSlotStart?: Date } = {},
  ): Promise<{
    ok: true;
    phone: string;
    catalogMessageId: string;
    threadId: string;
    providerMessageId?: string;
  }> {
    if (!this.evolution.isConfigured()) {
      throw new ServiceUnavailableException(
        'WhatsApp messaging is not configured (Evolution API).',
      );
    }

    const catalogMessage = await this.catalog
      .findById(this.toObjectId(id, 'catalog message'))
      .exec();
    if (!catalogMessage || !catalogMessage.active) {
      throw new NotFoundException('Catalog message not found.');
    }

    const contactId = dto.contactId?.trim()
      ? this.toObjectId(dto.contactId, 'contact')
      : catalogMessage.assignedContactId;
    if (!contactId) {
      throw new BadRequestException(
        'Assign a staff member before sending this message.',
      );
    }

    const contact = await this.contacts.findById(contactId).exec();
    if (!contact || !contact.active) {
      throw new NotFoundException('Contact not found.');
    }

    const sequence = await this.resolveNextCatalogSend(contact._id, {
      allowRestart: !options.catalogSlotStart,
      slotStart: options.catalogSlotStart,
    });
    // Allow re-sending the current open step (periodic reminder). Block only
    // when trying to send a different catalog message out of order.
    if (catalogMessage.assignedContactId) {
      if (
        !sequence.next ||
        String(sequence.next._id) !== String(catalogMessage._id)
      ) {
        throw new ConflictException(
          'Wait for the current catalog message to be answered before sending the next one.',
        );
      }
    } else if (sequence.awaitingReply) {
      throw new ConflictException(
        'Wait for the current catalog message to be answered before sending the next one.',
      );
    }

    const sentAt = new Date();
    const siblings = catalogMessage.assignedContactId
      ? await this.catalog
          .find({
            active: true,
            assignedContactId: catalogMessage.assignedContactId,
          })
          .exec()
      : [catalogMessage];
    const orderedSiblings = [...siblings].sort(
      (left, right) =>
        (left.sortOrder ?? 0) - (right.sortOrder ?? 0) ||
        String(left._id).localeCompare(String(right._id)),
    );
    const stepIndex = orderedSiblings.findIndex(
      (item) => String(item._id) === String(catalogMessage._id),
    );
    const total = Math.max(1, orderedSiblings.length);
    const step =
      stepIndex >= 0
        ? stepIndex + 1
        : Math.max(1, catalogMessage.sortOrder || 1);
    const labeledTitle = `${step}/${total} · ${catalogMessage.title}`;
    this.logger.log(
      `Catalog WhatsApp ${step}/${total} for ${contact.phone}: ${catalogMessage.title}`,
    );
    const interactive: InteractiveTemplateBody = {
      text: catalogMessage.body,
      title: labeledTitle,
      widgets: [],
    };
    const language = normalizeLanguage(
      contact.language,
      getWhatsAppDefaultLanguage(),
    );

    const outboundProjectId =
      (await this.resolvePreferredAskProjectId(contact)) ??
      normalizeContactProjectIds(contact)[0];

    try {
      const result = await this.evolution.sendInteractive(
        contact.phone,
        interactive,
        catalogMessage.body,
        language,
      );
      const recorded = await this.recordStaffMessage({
        contactId: contact._id,
        phone: contact.phone,
        direction: 'outbound',
        title: labeledTitle,
        body: catalogMessage.body,
        catalogMessageId: catalogMessage._id,
        status: 'sent',
        providerMessageId: result.providerMessageId,
        sentAt,
        receivedAt: sentAt,
        responseStatus: 'pending',
        source: 'catalog',
        ...(outboundProjectId ? { projectId: outboundProjectId } : {}),
      });
      if (!catalogMessage.assignedContactId) {
        catalogMessage.assignedContactId = contact._id;
        catalogMessage.sortOrder =
          catalogMessage.sortOrder && catalogMessage.sortOrder > 0
            ? catalogMessage.sortOrder
            : await this.nextCatalogSortOrder(contact._id);
        if (catalogMessage.save) {
          await catalogMessage.save();
        }
      }
      await this.cache.invalidatePaths([MESSAGING_CACHE_PATHS.catalog]);
      return {
        ok: true,
        phone: contact.phone,
        catalogMessageId: String(catalogMessage._id),
        threadId: String(recorded.threadId ?? recorded._id),
        providerMessageId: result.providerMessageId,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown send error';
      await this.recordStaffMessage({
        contactId: contact._id,
        phone: contact.phone,
        direction: 'outbound',
        title: labeledTitle,
        body: catalogMessage.body,
        catalogMessageId: catalogMessage._id,
        status: 'failed',
        error: message,
        sentAt,
        source: 'catalog',
        responseStatus: 'neutral',
        ...(outboundProjectId ? { projectId: outboundProjectId } : {}),
      });
      throw error;
    }
  }

  extractInboundFromEvolution(
    payload: Record<string, unknown>,
  ): InboundMessageDto | null {
    const data = this.evolutionPayloadData(payload);
    if (!data) {
      return null;
    }

    const key =
      typeof data.key === 'object' && data.key !== null
        ? (data.key as Record<string, unknown>)
        : undefined;
    if (key?.fromMe === true) {
      return null;
    }

    const phone = this.phoneFromEvolutionPayload(data, key);
    if (!phone) {
      return null;
    }

    const message =
      data.message && typeof data.message === 'object'
        ? (data.message as Record<string, unknown>)
        : undefined;
    if (
      message?.protocolMessage ||
      message?.messageStubType ||
      message?.senderKeyDistributionMessage ||
      message?.reactionMessage
    ) {
      return null;
    }
    const conversation =
      (typeof message?.conversation === 'string' && message.conversation) ||
      (typeof (message?.extendedTextMessage as { text?: string } | undefined)
        ?.text === 'string' &&
        (message?.extendedTextMessage as { text: string }).text) ||
      (typeof data.body === 'string' && data.body) ||
      (typeof data.text === 'string' && data.text) ||
      '';

    const providerMessageId =
      (typeof key?.id === 'string' && key.id) ||
      (typeof data.id === 'string' && data.id) ||
      undefined;

    const body = conversation.trim();
    // Status / ack / protocol events often arrive without text. Treating them as
    // replies was auto-closing step 1 and jumping straight to step 2.
    if (!body) {
      return null;
    }

    return {
      phone,
      body,
      providerMessageId,
    };
  }

  /** Normalize Evolution webhook/websocket shapes (`data` object or array). */
  private evolutionPayloadData(
    payload: Record<string, unknown>,
  ): Record<string, unknown> | null {
    const rawData = payload.data;
    let raw: unknown = rawData;
    if (typeof rawData === 'string' && rawData.trim()) {
      try {
        raw = JSON.parse(rawData) as object;
      } catch {
        return null;
      }
    }
    if (Array.isArray(raw)) {
      for (const item of raw) {
        if (typeof item === 'object' && item !== null) {
          return item as Record<string, unknown>;
        }
      }
      return null;
    }
    if (raw && typeof raw === 'object') {
      return raw as Record<string, unknown>;
    }
    // Some Evolution versions post the message object at the root.
    if (payload.key || payload.message) {
      return payload;
    }
    return null;
  }

  /** Prefer real @s.whatsapp.net / @c.us JIDs over privacy @lid identifiers. */
  private phoneFromEvolutionPayload(
    data: Record<string, unknown>,
    key: Record<string, unknown> | undefined,
  ): string | null {
    const candidates: unknown[] = [
      key?.senderPn,
      key?.remoteJidAlt,
      key?.participant,
      data.senderPn,
      data.sender_pn,
      data.remoteJidAlt,
      data.participant,
      data.sender,
      key?.remoteJid,
      data.remoteJid,
      data.from,
    ];

    for (const candidate of candidates) {
      if (typeof candidate !== 'string' || !candidate.trim()) {
        continue;
      }
      const phone = this.phoneFromWhatsAppJid(candidate);
      if (phone) {
        return phone;
      }
    }
    return null;
  }

  private phoneFromWhatsAppJid(jid: string): string | null {
    const trimmed = jid.trim();
    const at = trimmed.indexOf('@');
    const user = (at >= 0 ? trimmed.slice(0, at) : trimmed).replace(/\D/g, '');
    const server = (at >= 0 ? trimmed.slice(at + 1) : '').toLowerCase();
    if (server.includes('lid')) {
      return null;
    }
    if (user.length < 8 || user.length > 20) {
      return null;
    }
    return user;
  }

  async recordInboundMessage(dto: InboundMessageDto): Promise<{
    ok: true;
    contactId: string | null;
    phone: string;
    threadId: string | null;
    responseLatencyMs: number | null;
    responseStatus: string | null;
  }> {
    const phone = this.normalizePhone(dto.phone);
    const rawBody = (dto.body ?? dto.text ?? '').trim();
    const isMeaningfulReply = this.isMeaningfulCatalogInboundBody(rawBody);
    const replyBody = isMeaningfulReply ? rawBody : '(respuesta recibida)';
    const repliedAt = new Date();
    const contact = await this.findContactByPhone(phone);
    if (!contact) {
      this.logger.warn(`Inbound message for unknown phone ${phone}`);
      return {
        ok: true,
        contactId: null,
        phone,
        threadId: null,
        responseLatencyMs: null,
        responseStatus: null,
      };
    }

    const slotStart = contact.catalogSlotStartAt;
    const windowStart = repliedAt.getTime() - this.replyMatchWindowMs;
    let openCandidates = isMeaningfulReply
      ? await this.findOpenOutboundCandidates(
          contact._id,
          slotStart ?? undefined,
          windowStart,
        )
      : [];
    // SlotStart filters can drop a just-sent catalog if clocks / DST skew.
    // Fall back to the reply window so a real text reply still advances.
    if (isMeaningfulReply && openCandidates.length === 0 && slotStart) {
      openCandidates = await this.findOpenOutboundCandidates(
        contact._id,
        undefined,
        windowStart,
      );
    }
    const openThread = isMeaningfulReply
      ? await this.pickOpenOutboundThread(contact._id, openCandidates)
      : undefined;
    if (isMeaningfulReply && !openThread) {
      this.logger.warn(
        `Inbound from ${contact.phone} had no open outbound to match (slot=${contact.catalogSlotKey ?? 'none'})`,
      );
    } else if (isMeaningfulReply && openThread) {
      this.logger.log(
        `Inbound from ${contact.phone} matched ${openThread.source ?? 'unknown'} thread ${String(openThread._id)}`,
      );
    }

    let responseLatencyMs: number | null = null;
    let responseStatus: StaffResponseTrafficLight | null = null;
    let threadId: Types.ObjectId | null = null;

    if (isMeaningfulReply && openThread?.sentAt) {
      responseLatencyMs = computeResponseLatencyMs(
        openThread.sentAt,
        repliedAt,
      );
      responseStatus = responseStatusFromLatencyMs(responseLatencyMs);
      threadId = openThread.threadId ?? openThread._id;
      openThread.replyBody = replyBody;
      openThread.repliedAt = repliedAt;
      openThread.receivedAt = openThread.receivedAt ?? openThread.sentAt;
      openThread.responseLatencyMs = responseLatencyMs;
      openThread.responseStatus = responseStatus;

      let parsedProgress: StaffParsedProgress | undefined;
      if (
        openThread.source === 'catalog' ||
        openThread.source === 'task_checklist' ||
        openThread.source === 'obra_adelanto'
      ) {
        try {
          const progressProjectId = openThread.projectId?.trim();
          const progressAi = progressProjectId
            ? await this.resolveProgressAiForProject(progressProjectId)
            : undefined;
          const parsed = await this.progressParse.parseReply({
            replyBody,
            taskId: openThread.taskId,
            taskLabel: openThread.taskLabel,
            outboundBody: openThread.body,
            ...(progressAi ? { progressAi } : {}),
          });
          if (parsed) {
            parsedProgress = {
              percent: parsed.percent,
              ...(parsed.duration !== undefined
                ? { duration: parsed.duration }
                : {}),
              ...(parsed.avance !== undefined ? { avance: parsed.avance } : {}),
              ...(parsed.notes !== undefined ? { notes: parsed.notes } : {}),
              ...(parsed.byRole !== undefined ? { byRole: parsed.byRole } : {}),
              parsedAt: repliedAt,
              ...(parsed.model !== undefined ? { model: parsed.model } : {}),
            };
            openThread.parsedProgress = parsedProgress;
          }
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : 'Unknown progress parse error';
          this.logger.warn(
            `Progress parse failed for thread ${String(openThread._id)}: ${message}`,
          );
        }
      }

      if (openThread.save) {
        await openThread.save();
      } else {
        await this.messages
          .findByIdAndUpdate(openThread._id, {
            replyBody,
            repliedAt,
            receivedAt: openThread.receivedAt,
            responseLatencyMs,
            responseStatus,
            threadId,
            ...(parsedProgress ? { parsedProgress } : {}),
          })
          .exec();
      }
    }

    const inboundProjectId =
      openThread?.projectId?.trim() ||
      normalizeContactProjectIds(contact)[0] ||
      undefined;
    await this.recordStaffMessage({
      contactId: contact._id,
      phone: contact.phone,
      direction: 'inbound',
      body: replyBody,
      questionMessageId: openThread?._id,
      status: 'received',
      providerMessageId: dto.providerMessageId,
      receivedAt: repliedAt,
      repliedAt: isMeaningfulReply ? repliedAt : undefined,
      threadId: threadId ?? undefined,
      source: 'webhook',
      catalogMessageId: openThread?.catalogMessageId,
      taskId: openThread?.taskId,
      taskLabel: openThread?.taskLabel,
      sourceId: openThread?.sourceId,
      slotKey: openThread?.slotKey,
      title: openThread?.title,
      projectId: inboundProjectId,
      responseLatencyMs: responseLatencyMs ?? undefined,
      responseStatus: responseStatus ?? undefined,
    });

    if (
      isMeaningfulReply &&
      openThread?.catalogMessageId &&
      openThread.source === 'catalog'
    ) {
      try {
        await this.advanceCatalogAfterReply(openThread);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Unknown catalog advance error';
        this.logger.error(
          `Failed to advance catalog sequence after ${String(openThread.catalogMessageId)}: ${message}`,
        );
      }
    } else if (
      isMeaningfulReply &&
      openThread?.taskId &&
      openThread.source === 'task_checklist'
    ) {
      try {
        await this.advanceTaskChecklistAfterReply(openThread);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Unknown task checklist advance error';
        this.logger.error(
          `Failed to advance task checklist after ${openThread.taskId}: ${message}`,
        );
      }
    } else if (isMeaningfulReply && openThread?.source === 'obra_adelanto') {
      // End of sequence for this slot — no further auto-send.
      this.logger.debug(
        `Obra adelanto answered for ${contact.phone} slot ${openThread.slotKey ?? 'none'}`,
      );
    }

    const progressProjectId = openThread?.projectId?.trim() || inboundProjectId;
    await this.cache.invalidatePaths([
      MESSAGING_CACHE_PATHS.roster,
      MESSAGING_CACHE_PATHS.catalog,
      MESSAGING_CACHE_PATHS.taskChecklist,
      MESSAGING_CACHE_PATHS.progress(),
      ...(progressProjectId
        ? [MESSAGING_CACHE_PATHS.progress(progressProjectId)]
        : []),
    ]);
    return {
      ok: true,
      contactId: String(contact._id),
      phone: contact.phone,
      threadId: threadId ? String(threadId) : null,
      responseLatencyMs,
      responseStatus,
    };
  }

  /**
   * Minute job entry: claim due account schedule slots, then:
   * 1) email digest to the account
   * 2) WhatsApp: at most one next catalog step per assigned lead (await reply before next)
   * 3) WhatsApp weekly ciclo status (if configured)
   */
  async runScheduledNotifications(asOf: Date = new Date()): Promise<{
    dueAccounts: number;
    emailsSent: number;
    emailFailures: number;
    catalogSent: number;
    catalogFailed: number;
    whatsappTriggered: boolean;
    whatsappSummaries: WeeklyDispatchSummary[];
  }> {
    const accounts = await this.accounts
      .find({ 'emailNotificationSchedule.enabled': true })
      .exec();

    let emailsSent = 0;
    let emailFailures = 0;
    let claimed = 0;
    let catalogSlotKey: string | null = null;
    let catalogSlotStart: Date | null = null;
    const activeProjectIds = new Set<string>();
    const roster = await this.listStaffRoster();

    for (const account of accounts) {
      const schedule = normalizeSchedule(account.emailNotificationSchedule);
      if (!isScheduleDueAt(schedule, asOf)) {
        continue;
      }

      const slot = notificationSlotKey(schedule, asOf);
      const claimedAccount = await this.accounts
        .findOneAndUpdate(
          {
            _id: account._id,
            $or: [
              { lastNotificationSlot: { $exists: false } },
              { lastNotificationSlot: { $ne: slot } },
            ],
          },
          { $set: { lastNotificationSlot: slot } },
          { new: true },
        )
        .exec();

      if (!claimedAccount) {
        continue;
      }

      claimed += 1;
      const projectId = claimedAccount.activeProjectId?.trim();
      if (projectId) {
        activeProjectIds.add(projectId);
      }
      if (!catalogSlotKey) {
        catalogSlotKey = slot;
        catalogSlotStart = catalogSlotStartsAt(schedule, asOf);
      }
      try {
        await this.sendFollowUpEmail(account.email, roster, schedule.frequency);
        emailsSent += 1;
      } catch (error) {
        emailFailures += 1;
        this.logger.warn(
          `Follow-up email failed for ${account.email}: ${
            error instanceof Error ? error.message : 'unknown error'
          }`,
        );
      }
    }

    let catalogSent = 0;
    let catalogFailed = 0;
    let whatsappTriggered = false;
    let whatsappSummaries: WeeklyDispatchSummary[] = [];
    const projectIds =
      claimed > 0
        ? await this.resolveDispatchProjectIds([...activeProjectIds])
        : undefined;

    if (claimed > 0 && this.evolution.isConfigured()) {
      if (catalogSlotKey && catalogSlotStart) {
        await this.syncCatalogDispatchSlot(
          catalogSlotKey,
          catalogSlotStart,
          projectIds,
        );
      }
      const catalogResult = await this.sendAssignedCatalogMessages({
        slotStart: catalogSlotStart ?? undefined,
        projectIds,
      });
      catalogSent = catalogResult.sent;
      catalogFailed = catalogResult.failed;

      if (catalogSlotKey) {
        await this.kickoffTaskChecklists(catalogSlotKey, projectIds);
      }

      try {
        whatsappSummaries = await this.runWeeklyStatusDispatch(asOf);
        whatsappTriggered = true;
      } catch (error) {
        this.logger.warn(
          `WhatsApp ciclo dispatch skipped: ${
            error instanceof Error ? error.message : 'unknown error'
          }`,
        );
      }
    }

    return {
      dueAccounts: claimed,
      emailsSent,
      emailFailures,
      catalogSent,
      catalogFailed,
      whatsappTriggered,
      whatsappSummaries,
    };
  }

  /**
   * Per assigned lead, send only the next catalog step that is allowed
   * (never while a prior step awaits a reply).
   */
  async sendAssignedCatalogMessages(
    options: {
      slotStart?: Date;
      /**
       * When set to an array, only contacts for those obras are messaged.
       * Pass `undefined` for legacy unscoped dispatch (pre-isolation migration).
       */
      projectIds?: string[];
    } = {},
  ): Promise<{
    sent: number;
    failed: number;
    skipped: number;
  }> {
    if (!this.evolution.isConfigured()) {
      return { sent: 0, failed: 0, skipped: 0 };
    }

    const projectFilter =
      options.projectIds !== undefined
        ? new Set(
            options.projectIds
              .map((id) => id.trim())
              .filter((id) => id.length > 0),
          )
        : null;
    if (projectFilter && projectFilter.size === 0) {
      return { sent: 0, failed: 0, skipped: 0 };
    }

    const items = await this.catalog
      .find({
        active: true,
        assignedContactId: { $exists: true, $ne: null },
      })
      .exec();

    const byContact = new Map<string, StaffCatalogMessageDocument[]>();
    for (const item of items) {
      if (!item.assignedContactId) {
        continue;
      }
      const key = String(item.assignedContactId);
      const group = byContact.get(key) ?? [];
      group.push(item);
      byContact.set(key, group);
    }

    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const [contactId, group] of byContact) {
      const contact = await this.contacts
        .findById(this.toObjectId(contactId, 'contact'))
        .exec();
      if (!contact?.active) {
        skipped += group.length;
        continue;
      }
      if (!(await this.ensureContactInActiveProjects(contact, projectFilter))) {
        skipped += group.length;
        continue;
      }
      const sequence = await this.resolveNextCatalogSend(
        this.toObjectId(contactId, 'contact'),
        {
          allowRestart: !options.slotStart,
          slotStart: options.slotStart,
        },
      );
      // `awaitingReply` still carries `next` = the open step to remind.
      if (!sequence.next) {
        skipped += group.length;
        continue;
      }
      if (sequence.awaitingReply) {
        const recentFilter: Record<string, unknown> = {
          contactId: this.toObjectId(contactId, 'contact'),
          catalogMessageId: sequence.next._id,
          direction: 'outbound',
          source: 'catalog',
          status: 'sent',
        };
        if (options.slotStart) {
          recentFilter.sentAt = { $gte: options.slotStart };
        }
        const recent = await this.messages
          .find(recentFilter)
          .sort({ sentAt: -1, createdAt: -1 })
          .exec();
        const lastSentAt = recent[0]?.sentAt;
        if (
          recent.length > 1 &&
          lastSentAt &&
          Date.now() - lastSentAt.getTime() < this.catalogReminderMinIntervalMs
        ) {
          skipped += group.length;
          continue;
        }
      }
      try {
        await this.sendCatalogMessage(
          String(sequence.next._id),
          { contactId },
          { catalogSlotStart: options.slotStart },
        );
        sent += 1;
        skipped += Math.max(0, group.length - 1);
      } catch (error) {
        failed += 1;
        skipped += Math.max(0, group.length - 1);
        this.logger.warn(
          `Scheduled catalog send failed for ${String(sequence.next._id)}: ${
            error instanceof Error ? error.message : 'unknown error'
          }`,
        );
      }
    }

    return { sent, failed, skipped };
  }

  async runWeeklyStatusDispatch(
    asOf: Date = new Date(),
  ): Promise<WeeklyDispatchSummary[]> {
    if (!this.evolution.isConfigured()) {
      throw new ServiceUnavailableException(
        'WhatsApp messaging is not configured (Evolution API).',
      );
    }

    const activeCiclos = await this.ciclos.find({ active: true }).exec();
    const contacts = await this.contacts.find({ active: true }).exec();
    const summaries: WeeklyDispatchSummary[] = [];

    for (const ciclo of activeCiclos) {
      if (!isDateWithinCiclo(ciclo.ciclo_inicio, ciclo.ciclo_fin, asOf)) {
        continue;
      }

      const weekNumber = computeWeekNumber(ciclo.ciclo_inicio, asOf);
      const status = await this.workStatuses
        .findOne({ cicloId: ciclo._id, weekNumber })
        .exec();
      const templateAvailable = await this.templateExists(ciclo.templateKey);

      let sent = 0;
      let failed = 0;
      let skipped = 0;

      if (!templateAvailable || !status) {
        this.logger.warn(
          `Skipping ciclo ${String(ciclo._id)} week ${weekNumber}: missing ${
            !templateAvailable ? 'template' : 'work status'
          }.`,
        );
        for (const contact of contacts) {
          await this.recordDispatch({
            cicloId: ciclo._id,
            contactId: contact._id,
            phone: contact.phone,
            templateKey: ciclo.templateKey,
            weekNumber,
            status: 'skipped',
            renderedText: '',
            error: !templateAvailable
              ? 'Active template missing'
              : 'Work status missing for this week',
          });
          skipped += 1;
        }
        summaries.push({
          cicloId: String(ciclo._id),
          weekNumber,
          sent,
          failed,
          skipped,
        });
        continue;
      }

      for (const contact of contacts) {
        const alreadySent = await this.dispatches
          .exists({
            cicloId: ciclo._id,
            weekNumber,
            phone: contact.phone,
            status: 'sent',
          })
          .exec();
        if (alreadySent) {
          skipped += 1;
          continue;
        }

        const language = normalizeLanguage(
          contact.language,
          getWhatsAppDefaultLanguage(),
        );
        const body = await this.resolveTemplateBody(
          ciclo.templateKey,
          language,
        );
        if (!body || !status) {
          skipped += 1;
          continue;
        }

        const variables = {
          percent: String(status.percent),
          duration: status.duration ?? '',
          avance: status.avance ?? '',
          ciclo_inicio: formatDateOnly(ciclo.ciclo_inicio),
          ciclo_fin: formatDateOnly(ciclo.ciclo_fin),
          week: String(weekNumber),
          ciclo_name: ciclo.name,
          notes: status.notes ?? '',
        };

        const renderedText = renderTemplateText(body.text, variables);
        const renderedBody: InteractiveTemplateBody = {
          ...body,
          text: renderedText,
          title: body.title
            ? renderTemplateText(body.title, variables)
            : body.title,
        };

        try {
          await this.evolution.sendInteractive(
            contact.phone,
            renderedBody,
            renderedText,
            language,
          );
          await this.recordDispatch({
            cicloId: ciclo._id,
            contactId: contact._id,
            phone: contact.phone,
            templateKey: ciclo.templateKey,
            weekNumber,
            status: 'sent',
            renderedText,
            sentAt: new Date(),
          });
          sent += 1;
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Unknown send error';
          await this.recordDispatch({
            cicloId: ciclo._id,
            contactId: contact._id,
            phone: contact.phone,
            templateKey: ciclo.templateKey,
            weekNumber,
            status: 'failed',
            renderedText,
            error: message,
          });
          failed += 1;
        }
      }

      summaries.push({
        cicloId: String(ciclo._id),
        weekNumber,
        sent,
        failed,
        skipped,
      });
    }

    await this.cache.invalidatePaths([
      MESSAGING_CACHE_PATHS.dispatches(),
      ...summaries.map((summary) =>
        MESSAGING_CACHE_PATHS.dispatches(summary.cicloId),
      ),
    ]);

    return summaries;
  }

  private async sendFollowUpEmail(
    email: string,
    roster: StaffRosterRow[],
    frequency: 'weekly' | 'monthly',
  ): Promise<void> {
    const period = frequency === 'monthly' ? 'mensual' : 'semanal';
    const lines =
      roster.length === 0
        ? ['Sin contactos de staff activos.']
        : roster.map((row) => {
            const name = row.label ?? row.phone;
            const sent = row.lastSentAt
              ? `último envío ${row.lastSentAt}`
              : 'sin envíos';
            const reply = row.lastReceivedAt
              ? `última respuesta ${row.lastReceivedAt}`
              : 'sin respuesta';
            return `- ${name} (${row.phone}): ${sent}; ${reply}`;
          });

    const text = [
      `Resumen ${period} de equipo Nodika`,
      '',
      ...lines,
      '',
      'Abrí Staff en la app para más detalle.',
    ].join('\n');

    const to = [email];
    const extra = process.env.RESEND_TO?.trim();
    if (extra && extra.includes('@') && extra.toLowerCase() !== email) {
      to.push(extra);
    }

    await this.resend.emails.send({
      from: this.resendFrom,
      to,
      subject: `Nodika — seguimiento ${period}`,
      text,
    });
  }

  private async assertTemplateExists(templateKey: string): Promise<void> {
    if (await this.templateExists(templateKey)) {
      return;
    }
    throw new BadRequestException(
      `Active template "${templateKey}" was not found in locales or the database.`,
    );
  }

  private async templateExists(templateKey: string): Promise<boolean> {
    if (this.locales.getTemplate(templateKey, 'es')) {
      return true;
    }
    const template = await this.templates
      .findOne({ key: templateKey, active: true })
      .exec();
    return Boolean(template);
  }

  private async resolveTemplateBody(
    templateKey: string,
    language: string,
  ): Promise<InteractiveTemplateBody | null> {
    const localeTemplate = this.locales.getTemplate(templateKey, language);
    if (localeTemplate) {
      return this.locales.toInteractiveBody(localeTemplate);
    }

    const template = await this.templates
      .findOne({ key: templateKey, active: true })
      .exec();
    return template?.body ?? null;
  }

  validateTemplateBody(body: {
    text: string;
    title?: string;
    footer?: string;
    widgets: unknown[];
  }): InteractiveTemplateBody {
    if (!body.text?.trim()) {
      throw new BadRequestException('Template body.text is required.');
    }
    if (!Array.isArray(body.widgets)) {
      throw new BadRequestException('Template body.widgets must be an array.');
    }

    const widgets: TemplateWidget[] = body.widgets.map((raw, index) => {
      if (!raw || typeof raw !== 'object') {
        throw new BadRequestException(`Widget at index ${index} is invalid.`);
      }
      const widget = raw as Record<string, unknown>;
      const type = widget.type;
      if (type === 'button') {
        if (typeof widget.id !== 'string' || typeof widget.label !== 'string') {
          throw new BadRequestException(
            `Button widget at index ${index} requires id and label.`,
          );
        }
        return {
          type: 'button',
          id: widget.id,
          label: widget.label,
          action:
            widget.action === 'url' || widget.action === 'call'
              ? widget.action
              : 'reply',
          url: typeof widget.url === 'string' ? widget.url : undefined,
          phoneNumber:
            typeof widget.phoneNumber === 'string'
              ? widget.phoneNumber
              : undefined,
        };
      }
      if (type === 'input') {
        if (typeof widget.id !== 'string' || typeof widget.label !== 'string') {
          throw new BadRequestException(
            `Input widget at index ${index} requires id and label.`,
          );
        }
        return {
          type: 'input',
          id: widget.id,
          label: widget.label,
          placeholder:
            typeof widget.placeholder === 'string'
              ? widget.placeholder
              : undefined,
        };
      }
      if (type === 'checkbox') {
        if (
          typeof widget.id !== 'string' ||
          typeof widget.label !== 'string' ||
          !Array.isArray(widget.options) ||
          widget.options.length < 1
        ) {
          throw new BadRequestException(
            `Checkbox widget at index ${index} requires id, label, and options.`,
          );
        }
        return {
          type: 'checkbox',
          id: widget.id,
          label: widget.label,
          options: widget.options.map((option, optionIndex) => {
            if (
              !option ||
              typeof option !== 'object' ||
              typeof (option as { id?: unknown }).id !== 'string' ||
              typeof (option as { label?: unknown }).label !== 'string'
            ) {
              throw new BadRequestException(
                `Checkbox option ${optionIndex} at widget ${index} is invalid.`,
              );
            }
            const typed = option as { id: string; label: string };
            return { id: typed.id, label: typed.label };
          }),
        };
      }
      throw new BadRequestException(
        `Widget at index ${index} must be button, input, or checkbox.`,
      );
    });

    return {
      text: body.text,
      title: body.title,
      footer: body.footer,
      widgets,
    };
  }

  private async recordDispatch(
    data: Omit<MessageDispatch, never> & {
      cicloId: Types.ObjectId;
      contactId: Types.ObjectId;
    },
  ): Promise<void> {
    await this.dispatches.create(data);
  }

  private async recordStaffMessage(
    data: Omit<StaffMessage, never> & { contactId: Types.ObjectId },
  ): Promise<StaffMessageDocument> {
    const created = await this.messages.create({
      ...data,
      responseStatus:
        data.responseStatus ??
        (data.direction === 'outbound' && data.status === 'sent'
          ? 'pending'
          : data.responseStatus),
    });
    if (data.direction === 'outbound' && !data.threadId) {
      created.threadId = created._id;
      if (created.save) {
        await created.save();
      }
    }
    await this.cache.invalidatePaths([
      MESSAGING_CACHE_PATHS.roster,
      MESSAGING_CACHE_PATHS.catalog,
    ]);
    return created;
  }

  private async toCatalogRow(
    item: StaffCatalogMessageDocument,
  ): Promise<StaffCatalogRow> {
    let assignedLabel: string | null = null;
    let assignedPhone: string | null = null;
    if (item.assignedContactId) {
      const contact = await this.contacts
        .findById(item.assignedContactId)
        .exec();
      if (contact) {
        assignedLabel = contact.label ?? null;
        assignedPhone = contact.phone;
      }
    }

    const deliveries = await this.messages
      .find({
        catalogMessageId: item._id,
        direction: 'outbound',
        status: 'sent',
      })
      .sort({ sentAt: -1, createdAt: -1 })
      .limit(1)
      .exec();
    const last = deliveries[0] ?? null;
    const sentAt = last?.sentAt ?? null;
    const latencyMs =
      typeof last?.responseLatencyMs === 'number'
        ? last.responseLatencyMs
        : null;
    const catalogComplete =
      last && (await this.isCatalogOutboundComplete(last)) ? last : null;
    let responseStatus: string = 'neutral';
    if (catalogComplete?.repliedAt && latencyMs !== null) {
      responseStatus = responseStatusFromLatencyMs(latencyMs);
    } else if (catalogComplete?.repliedAt && sentAt) {
      responseStatus = responseStatusFromLatencyMs(
        computeResponseLatencyMs(sentAt, catalogComplete.repliedAt),
      );
    } else if (last && !catalogComplete && sentAt) {
      responseStatus = responseStatusWhileWaiting(sentAt);
    }

    return {
      _id: String(item._id),
      title: item.title,
      body: item.body,
      assignedContactId: item.assignedContactId
        ? String(item.assignedContactId)
        : null,
      assignedLabel,
      assignedPhone,
      sortOrder: item.sortOrder ?? 0,
      active: item.active,
      tags: normalizeCatalogTags(item.tags),
      lastSentAt: sentAt ? sentAt.toISOString() : null,
      repliedAt: catalogComplete?.repliedAt
        ? catalogComplete.repliedAt.toISOString()
        : null,
      responseLatencyMs: latencyMs,
      responseStatus,
    };
  }

  private async nextCatalogSortOrder(
    contactId: Types.ObjectId,
  ): Promise<number> {
    const siblings = await this.catalog
      .find({ active: true, assignedContactId: contactId })
      .exec();
    return (
      siblings.reduce((max, item) => Math.max(max, item.sortOrder ?? 0), 0) + 1
    );
  }

  private async renumberCatalogBucket(
    contactId: Types.ObjectId,
  ): Promise<void> {
    const siblings = await this.catalog
      .find({ active: true, assignedContactId: contactId })
      .exec();
    siblings.sort(
      (left, right) =>
        (left.sortOrder ?? 0) - (right.sortOrder ?? 0) ||
        String(left._id).localeCompare(String(right._id)),
    );
    for (let index = 0; index < siblings.length; index += 1) {
      const sibling = siblings[index];
      const nextOrder = index + 1;
      if (sibling.sortOrder !== nextOrder) {
        sibling.sortOrder = nextOrder;
        await sibling.save();
      }
    }
  }

  private async backfillCatalogSortOrders(
    items: StaffCatalogMessageDocument[],
  ): Promise<void> {
    const byContact = new Map<string, StaffCatalogMessageDocument[]>();
    for (const item of items) {
      if (!item.assignedContactId) {
        if (!item.sortOrder) {
          item.sortOrder = 0;
        }
        continue;
      }
      const key = String(item.assignedContactId);
      const list = byContact.get(key) ?? [];
      list.push(item);
      byContact.set(key, list);
    }
    for (const [, list] of byContact) {
      const needsBackfill = list.some((item) => !(item.sortOrder > 0));
      if (!needsBackfill) {
        continue;
      }
      list.sort(
        (left, right) =>
          (left.sortOrder ?? 0) - (right.sortOrder ?? 0) ||
          String(left._id).localeCompare(String(right._id)),
      );
      for (let index = 0; index < list.length; index += 1) {
        const item = list[index];
        item.sortOrder = index + 1;
        await item.save();
      }
    }
  }

  private async findOpenOutboundCandidates(
    contactId: Types.ObjectId,
    slotStart: Date | undefined,
    windowStartMs: number,
  ): Promise<StaffMessageDocument[]> {
    const recentOutbound = await this.messages
      .find({
        contactId,
        direction: 'outbound',
        status: 'sent',
        ...(slotStart ? { sentAt: { $gte: slotStart } } : {}),
      })
      .sort({ sentAt: -1, createdAt: -1 })
      .limit(25)
      .exec();
    const openCandidates: StaffMessageDocument[] = [];
    for (const item of recentOutbound) {
      if (await this.isCatalogOutboundComplete(item, slotStart)) {
        continue;
      }
      const sentAt =
        item.sentAt ??
        (item as StaffMessageDocument & { createdAt?: Date }).createdAt;
      if (!sentAt) {
        continue;
      }
      if (sentAt.getTime() >= windowStartMs) {
        openCandidates.push(item);
      }
    }
    return openCandidates;
  }

  /**
   * Prefer the lowest catalog sortOrder still awaiting a reply so operators
   * answer step N before we treat the reply as belonging to a later flood.
   */
  private async pickOpenOutboundThread(
    contactId: Types.ObjectId,
    openCandidates: StaffMessageDocument[],
  ): Promise<StaffMessageDocument | undefined> {
    const catalogOpens: Array<{
      item: StaffMessageDocument;
      sortOrder: number;
      sentAtMs: number;
    }> = [];
    for (const item of openCandidates) {
      if (item.source !== 'catalog' || !item.catalogMessageId) {
        continue;
      }
      const catalog = await this.catalog.findById(item.catalogMessageId).exec();
      if (!catalog || !catalog.active) {
        continue;
      }
      if (
        catalog.assignedContactId &&
        String(catalog.assignedContactId) !== String(contactId)
      ) {
        continue;
      }
      const sentAtMs =
        item.sentAt?.getTime() ??
        (
          item as StaffMessageDocument & { createdAt?: Date }
        ).createdAt?.getTime() ??
        0;
      catalogOpens.push({
        item,
        sortOrder: catalog.sortOrder ?? 0,
        sentAtMs,
      });
    }
    catalogOpens.sort(
      (left, right) =>
        left.sortOrder - right.sortOrder || left.sentAtMs - right.sentAtMs,
    );
    return catalogOpens[0]?.item ?? openCandidates[0];
  }

  private async advanceCatalogAfterReply(
    openThread: StaffMessageDocument,
  ): Promise<void> {
    if (!openThread.catalogMessageId || !openThread.contactId) {
      return;
    }
    const current = await this.catalog
      .findById(openThread.catalogMessageId)
      .exec();
    if (!current?.assignedContactId || !current.active) {
      return;
    }

    const lead = await this.contacts.findById(current.assignedContactId).exec();
    if (!lead?.active) {
      return;
    }

    const slotStart = lead.catalogSlotStartAt ?? undefined;
    const sequence = await this.resolveNextCatalogSend(lead._id, {
      allowRestart: false,
      slotStart,
    });
    const justAnswered =
      Boolean(openThread.repliedAt) &&
      this.isMeaningfulCatalogInboundBody(openThread.replyBody ?? '');

    if (!sequence.next) {
      const preferred = await this.resolvePreferredAskProjectId(lead);
      await this.tryStartTaskChecklistForContact(lead, preferred, {
        afterCatalogReply: true,
      });
      return;
    }

    // Same catalog step still open according to resolve — if this inbound just
    // answered it, start objective-task asks instead of waiting forever.
    if (
      String(sequence.next._id) === String(current._id) &&
      (sequence.awaitingReply || justAnswered)
    ) {
      if (justAnswered) {
        const preferred = await this.resolvePreferredAskProjectId(lead);
        await this.tryStartTaskChecklistForContact(lead, preferred, {
          afterCatalogReply: true,
        });
      }
      return;
    }

    if (sequence.awaitingReply) {
      return;
    }

    await this.sendCatalogMessage(
      String(sequence.next._id),
      { contactId: String(lead._id) },
      { catalogSlotStart: slotStart },
    );
  }

  async listTaskChecklists(
    filters: {
      contactId?: string;
      slotKey?: string;
    } = {},
  ): Promise<TaskChecklistRow[]> {
    const query: Record<string, unknown> = {
      direction: 'outbound',
      source: 'task_checklist',
    };
    if (filters.contactId?.trim()) {
      query.contactId = this.toObjectId(filters.contactId, 'contact');
    }
    if (filters.slotKey?.trim()) {
      query.slotKey = filters.slotKey.trim();
    }
    const rows = await this.messages
      .find(query)
      .sort({ sentAt: -1, createdAt: -1 })
      .limit(200)
      .exec();

    const result: TaskChecklistRow[] = [];
    for (const row of rows) {
      const inbound = row.repliedAt
        ? await this.messages
            .findOne({
              direction: 'inbound',
              threadId: row.threadId ?? row._id,
              status: 'received',
            })
            .sort({ receivedAt: -1 })
            .exec()
        : null;
      const status: TaskChecklistRow['status'] =
        row.status === 'failed'
          ? 'failed'
          : row.repliedAt
            ? 'answered'
            : 'pending';
      result.push({
        _id: String(row._id),
        sourceId: row.sourceId ? String(row.sourceId) : null,
        taskId: row.taskId ?? '',
        taskLabel: row.taskLabel ?? row.title ?? '',
        contactId: String(row.contactId),
        phone: row.phone,
        slotKey: row.slotKey ?? null,
        askedAt: (row.sentAt ?? new Date()).toISOString(),
        answeredAt: row.repliedAt ? row.repliedAt.toISOString() : null,
        replyBody: row.replyBody ?? inbound?.body ?? null,
        inboundMessageId: inbound ? String(inbound._id) : null,
        status,
      });
    }
    return result;
  }

  private async kickoffTaskChecklists(
    slotKey: string,
    projectIds?: string[],
  ): Promise<void> {
    const allowedProjects =
      projectIds === undefined
        ? null
        : new Set(
            projectIds.map((id) => id.trim()).filter((id) => id.length > 0),
          );
    if (allowedProjects && allowedProjects.size === 0) {
      return;
    }
    const assigned = await this.catalog
      .find({
        active: true,
        assignedContactId: { $exists: true, $ne: null },
      })
      .exec();
    const contactIds = [
      ...new Set(
        assigned
          .map((item) =>
            item.assignedContactId ? String(item.assignedContactId) : null,
          )
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    for (const contactId of contactIds) {
      const contact = await this.contacts
        .findById(this.toObjectId(contactId, 'contact'))
        .exec();
      if (!contact?.active) {
        continue;
      }
      if (
        !(await this.ensureContactInActiveProjects(contact, allowedProjects))
      ) {
        continue;
      }
      if (contact.catalogSlotKey && contact.catalogSlotKey !== slotKey) {
        continue;
      }
      const preferred =
        allowedProjects === null
          ? undefined
          : [...allowedProjects].find((id) =>
              normalizeContactProjectIds(contact).includes(id),
            );
      await this.tryStartTaskChecklistForContact(contact, preferred);
    }
  }

  private async tryStartTaskChecklistForContact(
    contact: WhatsAppContactDocument,
    preferredProjectId?: string,
    options: { afterCatalogReply?: boolean } = {},
  ): Promise<void> {
    const slotKey = contact.catalogSlotKey;
    if (!slotKey) {
      this.logger.warn(
        `Task checklist skipped for ${contact.phone}: missing catalogSlotKey`,
      );
      return;
    }
    if (!options.afterCatalogReply) {
      const sequence = await this.resolveNextCatalogSend(contact._id, {
        allowRestart: false,
        slotStart: contact.catalogSlotStartAt ?? undefined,
      });
      if (sequence.next) {
        return;
      }
    }
    await this.sendNextTaskChecklistAsk(contact, slotKey, preferredProjectId);
  }

  private async sendNextTaskChecklistAsk(
    contact: WhatsAppContactDocument,
    slotKey: string,
    preferredProjectId?: string,
  ): Promise<void> {
    if (!this.evolution.isConfigured()) {
      return;
    }

    const membership = normalizeContactProjectIds(contact);
    let projectId: string | undefined =
      (preferredProjectId && membership.includes(preferredProjectId)
        ? preferredProjectId
        : undefined) ??
      (await this.resolvePreferredAskProjectId(contact)) ??
      membership[0];
    if (!projectId) {
      const newest = await this.resolveNewestSourceProjectId();
      if (!newest) {
        this.logger.warn(
          `Task checklist skipped for ${contact.phone}: no projectId available`,
        );
        return;
      }
      projectId = newest;
      const projectIds = mergeContactProjectIds(membership, projectId);
      contact.projectIds = projectIds;
      contact.projectId = projectIds[0];
      await this.contacts
        .findByIdAndUpdate(contact._id, {
          projectIds,
          projectId: projectIds[0],
        })
        .exec();
    }

    const openAsk = await this.messages
      .findOne({
        contactId: contact._id,
        slotKey,
        direction: 'outbound',
        source: 'task_checklist',
        status: 'sent',
        repliedAt: { $exists: false },
      })
      .exec();
    if (openAsk) {
      this.logger.debug(
        `Task checklist waiting on open ask ${String(openAsk.taskId ?? openAsk._id)} for ${contact.phone}`,
      );
      return;
    }

    const loaded = await this.loadPendingObjectiveTasksForProject(projectId);
    if (!loaded) {
      this.logger.warn(
        `Task checklist skipped for ${contact.phone}: no source for project ${projectId}`,
      );
      await this.sendAdelantoCatchupIfNeeded(contact, slotKey, projectId);
      return;
    }
    const { sourceId, tasks, projectName } = loaded;
    if (tasks.length === 0) {
      this.logger.debug(
        `Task checklist empty (in-window) for ${contact.phone} project ${projectId}`,
      );
      await this.sendAdelantoCatchupIfNeeded(
        contact,
        slotKey,
        projectId,
        sourceId,
      );
      return;
    }

    const prior = await this.messages
      .find({
        contactId: contact._id,
        slotKey,
        direction: 'outbound',
        source: 'task_checklist',
        status: 'sent',
        repliedAt: { $exists: true },
      })
      .exec();
    const doneIds = new Set(
      prior.map((row) => row.taskId).filter((id): id is string => Boolean(id)),
    );
    const nextIndex = tasks.findIndex((task) => !doneIds.has(task.taskId));
    if (nextIndex < 0) {
      this.logger.debug(
        `Task checklist complete for ${contact.phone} slot ${slotKey}`,
      );
      await this.sendAdelantoCatchupIfNeeded(
        contact,
        slotKey,
        projectId,
        sourceId,
      );
      return;
    }
    const task = tasks[nextIndex];
    // Chat progress: answered asks + remaining unasked pending (stable across 100% replies).
    const answered = doneIds.size;
    const remaining = tasks.filter((row) => !doneIds.has(row.taskId)).length;
    const step = answered + 1;
    const total = answered + remaining;
    const labeledTitle = `${projectName} · Tarea ${step}/${total} · ${task.label}`;
    const body = `Obra ${projectName}: ¿Cómo va la tarea "${task.label}"? Contanos el avance actual.`;
    const askedAt = new Date();

    const language = normalizeLanguage(
      contact.language,
      getWhatsAppDefaultLanguage(),
    );
    const interactive: InteractiveTemplateBody = {
      text: body,
      title: labeledTitle,
      widgets: [],
    };

    try {
      const result = await this.evolution.sendInteractive(
        contact.phone,
        interactive,
        body,
        language,
      );
      await this.recordStaffMessage({
        contactId: contact._id,
        phone: contact.phone,
        direction: 'outbound',
        title: labeledTitle,
        body,
        taskId: task.taskId,
        taskLabel: task.label,
        sourceId,
        projectId,
        slotKey,
        status: 'sent',
        providerMessageId: result.providerMessageId,
        sentAt: askedAt,
        receivedAt: askedAt,
        responseStatus: 'pending',
        source: 'task_checklist',
      });
      this.logger.log(
        `Task checklist ${step}/${total} for ${contact.phone}: ${task.label}`,
      );
      await this.cache.invalidatePaths([MESSAGING_CACHE_PATHS.taskChecklist]);
    } catch (error) {
      await this.recordStaffMessage({
        contactId: contact._id,
        phone: contact.phone,
        direction: 'outbound',
        title: labeledTitle,
        body,
        taskId: task.taskId,
        taskLabel: task.label,
        sourceId,
        projectId,
        slotKey,
        status: 'failed',
        error: error instanceof Error ? error.message : 'unknown error',
        sentAt: askedAt,
        source: 'task_checklist',
      });
      this.logger.warn(
        `Task checklist send failed for ${contact.phone} ${task.taskId}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }
  }

  private async sendAdelantoCatchupIfNeeded(
    contact: WhatsAppContactDocument,
    slotKey: string,
    projectId?: string,
    sourceId?: Types.ObjectId,
  ): Promise<void> {
    if (!this.evolution.isConfigured()) {
      return;
    }

    const already = await this.messages
      .findOne({
        contactId: contact._id,
        slotKey,
        direction: 'outbound',
        source: 'obra_adelanto',
        status: 'sent',
      })
      .exec();
    if (already) {
      return;
    }

    const openAsk = await this.messages
      .findOne({
        contactId: contact._id,
        slotKey,
        direction: 'outbound',
        status: 'sent',
        repliedAt: { $exists: false },
        source: { $in: ['task_checklist', 'obra_adelanto', 'catalog'] },
      })
      .exec();
    if (openAsk) {
      return;
    }

    const adelanto = (
      await this.catalog
        .find({
          active: true,
          assignedContactId: contact._id,
        })
        .exec()
    ).find((item) => isAdelantoCatalogMessage(item));
    if (!adelanto) {
      this.logger.debug(
        `Obra adelanto skipped for ${contact.phone}: no adelanto catalog copy`,
      );
      return;
    }

    const membership = normalizeContactProjectIds(contact);
    const resolvedProjectId =
      (projectId && membership.includes(projectId) ? projectId : undefined) ??
      (await this.resolvePreferredAskProjectId(contact)) ??
      membership[0];
    let resolvedSourceId = sourceId;
    let labeledProject = resolvedProjectId ?? 'obra';
    if (resolvedProjectId) {
      const source = await this.resolveSourceForProject(resolvedProjectId);
      if (source) {
        resolvedSourceId = source._id;
        labeledProject =
          projectNombreFromSnapshotContent(source.content) ?? resolvedProjectId;
      }
    }

    const labeledTitle = `${labeledProject} · Adelanto de obra`;
    const body = adelanto.body;
    const askedAt = new Date();
    const language = normalizeLanguage(
      contact.language,
      getWhatsAppDefaultLanguage(),
    );
    const interactive: InteractiveTemplateBody = {
      text: body,
      title: labeledTitle,
      widgets: [],
    };

    try {
      const result = await this.evolution.sendInteractive(
        contact.phone,
        interactive,
        body,
        language,
      );
      await this.recordStaffMessage({
        contactId: contact._id,
        phone: contact.phone,
        direction: 'outbound',
        title: labeledTitle,
        body,
        catalogMessageId: adelanto._id,
        sourceId: resolvedSourceId,
        projectId: resolvedProjectId,
        slotKey,
        status: 'sent',
        providerMessageId: result.providerMessageId,
        sentAt: askedAt,
        receivedAt: askedAt,
        responseStatus: 'pending',
        source: 'obra_adelanto',
      });
      this.logger.log(
        `Obra adelanto sent for ${contact.phone} slot ${slotKey}`,
      );
      await this.cache.invalidatePaths([MESSAGING_CACHE_PATHS.catalog]);
    } catch (error) {
      await this.recordStaffMessage({
        contactId: contact._id,
        phone: contact.phone,
        direction: 'outbound',
        title: labeledTitle,
        body,
        catalogMessageId: adelanto._id,
        sourceId: resolvedSourceId,
        projectId: resolvedProjectId,
        slotKey,
        status: 'failed',
        error: error instanceof Error ? error.message : 'unknown error',
        sentAt: askedAt,
        source: 'obra_adelanto',
      });
      this.logger.warn(
        `Obra adelanto send failed for ${contact.phone}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }
  }

  private async advanceTaskChecklistAfterReply(
    openThread: StaffMessageDocument,
  ): Promise<void> {
    if (!openThread.taskId || !openThread.contactId) {
      return;
    }
    const contact = await this.contacts.findById(openThread.contactId).exec();
    if (!contact?.active || !contact.catalogSlotKey) {
      return;
    }
    await this.sendNextTaskChecklistAsk(contact, contact.catalogSlotKey);
  }

  /**
   * Prefer account.activeProjectId. If unset (pre-selector accounts), fall back
   * to the newest SourceOfTruth projectId. `undefined` means legacy unscoped
   * dispatch when neither is available.
   */
  private async resolveDispatchProjectIds(
    fromAccounts: string[],
  ): Promise<string[] | undefined> {
    const trimmed = fromAccounts
      .map((id) => id.trim())
      .filter((id) => id.length > 0);
    if (trimmed.length > 0) {
      return [...new Set(trimmed)];
    }
    const fallback = await this.resolveNewestSourceProjectId();
    if (fallback) {
      this.logger.warn(
        `No activeProjectId on claimed accounts; using latest source project ${fallback}`,
      );
      return [fallback];
    }
    this.logger.warn(
      'No activeProjectId and no sourced projectId; catalog uses legacy unscoped dispatch',
    );
    return undefined;
  }

  private async resolveNewestSourceProjectId(): Promise<string | null> {
    const rows = await this.sources
      .find({ projectId: { $exists: true, $ne: null } })
      .exec();
    if (!rows.length) {
      return null;
    }
    const latest = [...rows].sort((left, right) => {
      const leftAt =
        (left as { createdAt?: Date }).createdAt?.getTime() ??
        left._id.getTimestamp().getTime();
      const rightAt =
        (right as { createdAt?: Date }).createdAt?.getTime() ??
        right._id.getTimestamp().getTime();
      return rightAt - leftAt;
    })[0];
    return latest?.projectId?.trim() || null;
  }

  /**
   * Contacts with any matching membership are eligible. Legacy empty
   * membership is auto-stamped when exactly one active obra is in scope.
   */
  private async ensureContactInActiveProjects(
    contact: WhatsAppContactDocument,
    allowed: Set<string> | null,
  ): Promise<boolean> {
    if (!allowed) {
      return true;
    }
    if (contactBelongsToAnyProject(contact, allowed)) {
      return true;
    }
    const membership = normalizeContactProjectIds(contact);
    if (membership.length > 0) {
      return false;
    }
    if (allowed.size !== 1) {
      return false;
    }
    const onlyProject = [...allowed][0];
    const projectIds = [onlyProject];
    contact.projectIds = projectIds;
    contact.projectId = onlyProject;
    await this.contacts
      .findByIdAndUpdate(contact._id, {
        projectIds,
        projectId: onlyProject,
      })
      .exec();
    this.logger.log(
      `Stamped projectId ${onlyProject} on legacy contact ${contact.phone}`,
    );
    return true;
  }

  /**
   * Newest SourceOfTruth for a Nodika obra. Never mixes projects.
   */
  private async resolveSourceForProject(
    projectId: string,
  ): Promise<(SourceOfTruth & { _id: Types.ObjectId }) | null> {
    const trimmed = projectId.trim();
    if (!trimmed) {
      return null;
    }
    const rows = await this.sources.find({ projectId: trimmed }).exec();
    if (!rows.length) {
      return null;
    }
    const latest = [...rows].sort((left, right) => {
      const leftAt =
        (left as { createdAt?: Date }).createdAt?.getTime() ??
        left._id.getTimestamp().getTime();
      const rightAt =
        (right as { createdAt?: Date }).createdAt?.getTime() ??
        right._id.getTimestamp().getTime();
      return rightAt - leftAt;
    })[0];
    return latest?._id ? latest : null;
  }

  private async loadLiveTaskPercentsForProject(
    projectId: string,
  ): Promise<Map<string, number>> {
    const rows = await this.messages
      .find({
        projectId,
        direction: 'outbound',
        parsedProgress: { $exists: true },
      })
      .sort({ repliedAt: -1 })
      .exec();

    const byTaskId = new Map<string, number>();
    for (const row of rows) {
      const taskId = row.taskId?.trim();
      if (!taskId || !row.parsedProgress || byTaskId.has(taskId)) {
        continue;
      }
      const percent = row.parsedProgress.percent;
      if (typeof percent !== 'number' || !Number.isFinite(percent)) {
        continue;
      }
      byTaskId.set(taskId, percent);
    }
    return byTaskId;
  }

  private async loadPendingObjectiveTasksForProject(
    projectId: string,
  ): Promise<{
    sourceId: Types.ObjectId;
    projectName: string;
    tasks: ReturnType<typeof extractPendingObjectiveTasks>;
  } | null> {
    const latest = await this.resolveSourceForProject(projectId);
    if (!latest) {
      return null;
    }
    const livePercentByTaskId =
      await this.loadLiveTaskPercentsForProject(projectId);
    const timezone = await this.resolveAskTimezone();
    const today = calendarDateInTimeZone(new Date(), timezone);
    return {
      sourceId: latest._id,
      projectName:
        projectNombreFromSnapshotContent(latest.content) ?? projectId,
      tasks: extractPendingObjectiveTasks(latest.content, {
        livePercentByTaskId,
        today,
      }),
    };
  }

  private async resolveAskTimezone(): Promise<string> {
    const account = await this.accounts
      .findOne({ activeProjectId: { $exists: true, $ne: null } })
      .exec();
    const fallback =
      account ?? (await this.accounts.findOne().sort({ createdAt: -1 }).exec());
    return normalizeSchedule(fallback?.emailNotificationSchedule).timezone;
  }

  /**
   * A catalog step only counts as answered when the lead sent real text that
   * was stored as a matching inbound row. Outbound-only repliedAt stamps from
   * ack/status webhooks used to skip step 1 and jump straight to step 2.
   */
  /**
   * Stamp the active catalog cycle on every lead with assigned messages so
   * replies from prior slots/dates no longer advance the sequence.
   */
  private async syncCatalogDispatchSlot(
    slotKey: string,
    slotStart: Date,
    projectIds?: string[],
  ): Promise<void> {
    const allowedProjects =
      projectIds === undefined
        ? null
        : new Set(
            projectIds.map((id) => id.trim()).filter((id) => id.length > 0),
          );
    if (allowedProjects && allowedProjects.size === 0) {
      return;
    }
    const assigned = await this.catalog
      .find({
        active: true,
        assignedContactId: { $exists: true, $ne: null },
      })
      .exec();
    const contactIds = new Set(
      assigned
        .map((item) =>
          item.assignedContactId ? String(item.assignedContactId) : null,
        )
        .filter((id): id is string => Boolean(id)),
    );
    for (const contactId of contactIds) {
      const contactOid = this.toObjectId(contactId, 'contact');
      const contact = await this.contacts.findById(contactOid).exec();
      if (!contact) {
        continue;
      }
      if (
        !(await this.ensureContactInActiveProjects(contact, allowedProjects))
      ) {
        continue;
      }
      if (contact.catalogSlotKey === slotKey) {
        continue;
      }
      if (contact.catalogSlotKey) {
        this.logger.log(
          `Catalog cycle ${slotKey} for ${contact.phone} (was ${contact.catalogSlotKey})`,
        );
      }
      await this.contacts
        .findByIdAndUpdate(contactOid, {
          catalogSlotKey: slotKey,
          catalogSlotStartAt: slotStart,
        })
        .exec();
    }
  }

  private isMeaningfulCatalogInboundBody(body: string): boolean {
    const trimmed = body.trim();
    if (!trimmed || trimmed === '(respuesta recibida)') {
      return false;
    }
    if (trimmed.length < 2) {
      return false;
    }
    const normalized = trimmed
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase();
    const ackLike = new Set(['recibido', 'received', 'vale', 'listo']);
    return !ackLike.has(normalized);
  }

  private async isCatalogOutboundComplete(
    message: StaffMessageDocument,
    slotStart?: Date,
  ): Promise<boolean> {
    if (!message.repliedAt) {
      return false;
    }
    const replyBody = (message.replyBody ?? '').trim();
    if (!this.isMeaningfulCatalogInboundBody(replyBody)) {
      return false;
    }
    if (
      message.source !== 'catalog' ||
      !message.catalogMessageId ||
      !message.contactId
    ) {
      return true;
    }

    const sentAt =
      message.sentAt ??
      (message as StaffMessageDocument & { createdAt?: Date }).createdAt;
    if (!sentAt) {
      return false;
    }
    if (slotStart && sentAt.getTime() < slotStart.getTime()) {
      return false;
    }

    const inboundSince =
      slotStart && slotStart.getTime() > sentAt.getTime() ? slotStart : sentAt;
    const inbound = await this.messages
      .findOne({
        contactId: message.contactId,
        direction: 'inbound',
        status: 'received',
        catalogMessageId: message.catalogMessageId,
        receivedAt: { $gte: inboundSince },
      })
      .sort({ receivedAt: -1 })
      .exec();
    if (!inbound) {
      return false;
    }
    const inboundBody = (inbound.body ?? '').trim();
    return this.isMeaningfulCatalogInboundBody(inboundBody);
  }

  /** Prefer account active obra that the contact belongs to. */
  private async resolvePreferredAskProjectId(
    contact: WhatsAppContactDocument,
  ): Promise<string | undefined> {
    const membership = normalizeContactProjectIds(contact);
    if (membership.length === 0) {
      return undefined;
    }
    const accounts = await this.accounts
      .find({
        activeProjectId: { $exists: true, $ne: null },
      })
      .exec();
    for (const account of accounts) {
      const active = account.activeProjectId?.trim();
      if (active && membership.includes(active)) {
        return active;
      }
    }
    return membership[0];
  }

  /**
   * Clear invalid catalog closures so the earliest open step can be reminded.
   */
  private async reopenInvalidCatalogClose(
    message: StaffMessageDocument,
  ): Promise<void> {
    if (!message.repliedAt) {
      return;
    }
    if (await this.isCatalogOutboundComplete(message)) {
      return;
    }
    await this.messages
      .findByIdAndUpdate(message._id, {
        $unset: { repliedAt: 1, replyBody: 1, responseLatencyMs: 1 },
        responseStatus: 'pending',
      })
      .exec();
    message.repliedAt = undefined;
    message.replyBody = undefined;
    message.responseLatencyMs = undefined;
    message.responseStatus = 'pending';
  }

  /**
   * Next catalog WhatsApp for a lead:
   * - first never-sent step by sortOrder, or
   * - the earliest unanswered step (for periodic reminders; later steps stay blocked), or
   * - first step again after every step has been answered (when allowRestart).
   */
  private async resolveNextCatalogSend(
    contactId: Types.ObjectId,
    options: { allowRestart?: boolean; slotStart?: Date } = {},
  ): Promise<{
    next: StaffCatalogMessageDocument | null;
    awaitingReply: boolean;
  }> {
    const allowRestart = options.allowRestart !== false;
    const slotStart = options.slotStart;
    const items = (
      await this.catalog
        .find({
          active: true,
          assignedContactId: contactId,
        })
        .exec()
    )
      .filter((item) => !isAdelantoCatalogMessage(item))
      .sort(
        (left, right) =>
          (left.sortOrder ?? 0) - (right.sortOrder ?? 0) ||
          String(left._id).localeCompare(String(right._id)),
      );
    if (items.length === 0) {
      return { next: null, awaitingReply: false };
    }

    for (const item of items) {
      const outboundFilter: Record<string, unknown> = {
        contactId,
        catalogMessageId: item._id,
        direction: 'outbound',
        source: 'catalog',
        status: 'sent',
      };
      if (slotStart) {
        outboundFilter.sentAt = { $gte: slotStart };
      }
      const latest = await this.messages
        .find(outboundFilter)
        .sort({ sentAt: -1, createdAt: -1 })
        .limit(1)
        .exec();
      const last = latest[0];
      if (!last) {
        return { next: item, awaitingReply: false };
      }
      if (!(await this.isCatalogOutboundComplete(last, slotStart))) {
        await this.reopenInvalidCatalogClose(last);
        // Keep reminding this step; do not advance to later flooded steps.
        this.logger.log(
          `Catalog sequence reopen ${String(contactId)} step ${item.sortOrder}/${items.length}: ${item.title}`,
        );
        return { next: item, awaitingReply: true };
      }
      this.logger.debug(
        `Catalog sequence ${String(contactId)} step ${item.sortOrder}/${items.length} complete: ${item.title}`,
      );
    }

    if (!allowRestart) {
      return { next: null, awaitingReply: false };
    }
    this.logger.log(
      `Catalog sequence restart ${String(contactId)}: ${items[0]?.title ?? 'none'}`,
    );
    return { next: items[0] ?? null, awaitingReply: false };
  }

  /** True when two E.164-ish phones are the same person (AR 549/541 variants). */
  private phonesMatch(left: string, right: string): boolean {
    const a = left.replace(/\D/g, '');
    const b = right.replace(/\D/g, '');
    if (!a || !b) {
      return false;
    }
    if (a === b) {
      return true;
    }
    const min = Math.min(a.length, b.length, 10);
    return min >= 8 && a.slice(-min) === b.slice(-min);
  }

  private async deactivatePhoneVariantDuplicates(
    keeper: WhatsAppContactDocument,
    phone: string,
  ): Promise<void> {
    const contacts = await this.contacts.find().exec();
    for (const contact of contacts) {
      if (String(contact._id) === String(keeper._id)) {
        continue;
      }
      if (!contact.active || !this.phonesMatch(contact.phone, phone)) {
        continue;
      }
      await this.contacts
        .findByIdAndUpdate(contact._id, { active: false })
        .exec();
      this.logger.warn(
        `Deactivated duplicate contact ${contact.phone} (${String(contact._id)}); keeper ${keeper.phone}`,
      );
    }
  }

  /**
   * Prefer progress AI settings from the account that has this obra active.
   */
  private async resolveProgressAiForProject(
    projectId: string,
  ): Promise<ProgressAiSettings | undefined> {
    const account = await this.accounts
      .findOne({ activeProjectId: projectId })
      .exec();
    return normalizeProgressAi(account?.progressAi);
  }

  /**
   * Match contacts even when WhatsApp JIDs omit/include country or mobile `9`.
   * When several records collide after multi-obra staffing, prefer the contact
   * that owns an open catalog outbound / catalog assignment so replies advance.
   */
  private async findContactByPhone(
    phone: string,
  ): Promise<WhatsAppContactDocument | null> {
    const needle = phone.replace(/\D/g, '');
    const contacts = await this.contacts.find().exec();
    const matches = contacts.filter((contact) =>
      this.phonesMatch(contact.phone, needle),
    );
    if (matches.length === 0) {
      return null;
    }
    if (matches.length === 1) {
      return matches[0];
    }

    const assignedIds = new Set(
      (
        await this.catalog
          .find({
            active: true,
            assignedContactId: { $exists: true, $ne: null },
          })
          .exec()
      )
        .map((row) =>
          row.assignedContactId ? String(row.assignedContactId) : null,
        )
        .filter((id): id is string => Boolean(id)),
    );

    let best = matches[0];
    let bestScore = Number.NEGATIVE_INFINITY;
    for (const contact of matches) {
      let score = 0;
      if (contact.active) {
        score += 10;
      }
      if (contact.phone.replace(/\D/g, '') === needle) {
        score += 5;
      }
      if (assignedIds.has(String(contact._id))) {
        score += 50;
      }
      if (contact.catalogSlotKey) {
        score += 15;
      }
      const openCatalog = await this.messages
        .findOne({
          contactId: contact._id,
          direction: 'outbound',
          status: 'sent',
          source: 'catalog',
          repliedAt: { $exists: false },
        })
        .exec();
      if (openCatalog) {
        score += 100;
      }
      if (score > bestScore) {
        bestScore = score;
        best = contact;
      }
    }

    this.logger.warn(
      `Ambiguous phone ${needle}: chose ${best.phone} (${String(best._id)}) among ${matches.length} contacts`,
    );
    return best;
  }

  private toObjectId(id: string, label: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`Invalid ${label} id.`);
    }
    return new Types.ObjectId(id);
  }
}

function resolveContactProgressRole(tags: string[]): ObraProgressRole {
  for (const role of OBRA_PROGRESS_ROLES) {
    if (tags.includes(role)) {
      return role;
    }
  }
  return 'jefe_obra';
}

function accumulateRolePercents(
  buckets: Record<ObraProgressRole, number[]>,
  progress: StaffParsedProgress,
): void {
  const byRole = progress.byRole;
  const hasByRole =
    !!byRole &&
    OBRA_PROGRESS_ROLES.some((role) => typeof byRole[role] === 'number');
  if (!hasByRole) {
    buckets.jefe_obra.push(progress.percent);
    return;
  }
  for (const role of OBRA_PROGRESS_ROLES) {
    const value = byRole[role];
    if (typeof value === 'number' && Number.isFinite(value)) {
      buckets[role].push(value);
    }
  }
}

function average(values: number[]): number {
  return (
    Math.round(
      (values.reduce((sum, value) => sum + value, 0) / values.length) * 10,
    ) / 10
  );
}

function averageOrNull(values: number[]): number | null {
  return values.length === 0 ? null : average(values);
}
