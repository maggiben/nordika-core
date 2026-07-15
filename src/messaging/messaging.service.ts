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
  isScheduleDueAt,
  normalizeSchedule,
  notificationSlotKey,
  catalogSlotStartsAt,
} from '../account/schedule';
import { ACCOUNT_MODEL, AccountDocument } from '../auth/auth.schema';
import { MESSAGING_CACHE_PATHS } from '../cache/cache.constants';
import { OptionalCacheService } from '../cache/optional-cache.service';
import {
  getAuthConfig,
  getWhatsAppDefaultLanguage,
} from '../config/environment';
import { LocaleService } from '../i18n/locale.service';
import { normalizeLanguage } from '../i18n/languages';
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
  STAFF_CATALOG_MESSAGE_MODEL,
  STAFF_MESSAGE_MODEL,
  StaffCatalogMessageDocument,
  StaffMessage,
  StaffMessageDocument,
  TemplateWidget,
  WHATSAPP_CONTACT_MODEL,
  WORK_STATUS_MODEL,
  WhatsAppContactDocument,
  WorkStatusDocument,
} from './messaging.schema';
import { extractPendingObjectiveTasks } from './pending-objective-tasks';
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
    const contact = await this.contacts.create({
      phone: this.normalizePhone(dto.phone),
      label: dto.label,
      language: normalizeLanguage(dto.language, getWhatsAppDefaultLanguage()),
      active: dto.active ?? true,
      tags: dto.tags ?? ['staff'],
      ...(dto.projectId?.trim() ? { projectId: dto.projectId.trim() } : {}),
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
    const contact = await this.contacts
      .findByIdAndUpdate(this.toObjectId(id, 'contact'), dto, {
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

  async sendTestMessage(dto: TestSendDto): Promise<{
    ok: true;
    phone: string;
    templateKey: string;
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
    const body = await this.resolveTemplateBody(dto.templateKey, language);
    if (!body) {
      throw new NotFoundException(`Template ${dto.templateKey} was not found.`);
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
          templateKey: dto.templateKey,
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
        templateKey: dto.templateKey,
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
          templateKey: dto.templateKey,
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
        projectId: contact.projectId?.trim() || null,
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
        ...(contact.projectId?.trim()
          ? { projectId: contact.projectId.trim() }
          : {}),
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
        ...(contact.projectId?.trim()
          ? { projectId: contact.projectId.trim() }
          : {}),
      });
      throw error;
    }
  }

  extractInboundFromEvolution(
    payload: Record<string, unknown>,
  ): InboundMessageDto | null {
    const data =
      payload.data && typeof payload.data === 'object'
        ? (payload.data as Record<string, unknown>)
        : payload;

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
    const recentOutbound = await this.messages
      .find({
        contactId: contact._id,
        direction: 'outbound',
        status: 'sent',
        ...(slotStart ? { sentAt: { $gte: slotStart } } : {}),
      })
      .sort({ sentAt: -1, createdAt: -1 })
      .limit(25)
      .exec();
    const windowStart = repliedAt.getTime() - this.replyMatchWindowMs;
    const openCandidates: StaffMessageDocument[] = [];
    for (const item of recentOutbound) {
      if (await this.isCatalogOutboundComplete(item, slotStart ?? undefined)) {
        continue;
      }
      const sentAt =
        item.sentAt ??
        (item as StaffMessageDocument & { createdAt?: Date }).createdAt;
      if (!sentAt) {
        continue;
      }
      if (sentAt.getTime() >= windowStart) {
        openCandidates.push(item);
      }
    }
    const openThread = isMeaningfulReply
      ? await this.pickOpenOutboundThread(contact._id, openCandidates)
      : undefined;

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
          })
          .exec();
      }
    }

    const inboundProjectId =
      openThread?.projectId?.trim() || contact.projectId?.trim() || undefined;
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
    }

    await this.cache.invalidatePaths([
      MESSAGING_CACHE_PATHS.roster,
      MESSAGING_CACHE_PATHS.catalog,
      MESSAGING_CACHE_PATHS.taskChecklist,
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
    if (sequence.awaitingReply) {
      return;
    }
    if (!sequence.next) {
      await this.tryStartTaskChecklistForContact(lead);
      return;
    }
    if (String(sequence.next._id) === String(current._id)) {
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
      await this.tryStartTaskChecklistForContact(contact);
    }
  }

  private async tryStartTaskChecklistForContact(
    contact: WhatsAppContactDocument,
  ): Promise<void> {
    const slotKey = contact.catalogSlotKey;
    if (!slotKey) {
      return;
    }
    const sequence = await this.resolveNextCatalogSend(contact._id, {
      allowRestart: false,
      slotStart: contact.catalogSlotStartAt ?? undefined,
    });
    if (sequence.next) {
      return;
    }
    await this.sendNextTaskChecklistAsk(contact, slotKey);
  }

  private async sendNextTaskChecklistAsk(
    contact: WhatsAppContactDocument,
    slotKey: string,
  ): Promise<void> {
    if (!this.evolution.isConfigured()) {
      return;
    }

    let projectId = contact.projectId?.trim();
    if (!projectId) {
      projectId = (await this.resolveNewestSourceProjectId()) ?? undefined;
      if (!projectId) {
        return;
      }
      contact.projectId = projectId;
      await this.contacts.findByIdAndUpdate(contact._id, { projectId }).exec();
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
      return;
    }

    const loaded = await this.loadPendingObjectiveTasksForProject(projectId);
    if (!loaded) {
      return;
    }
    const { sourceId, tasks } = loaded;
    if (tasks.length === 0) {
      return;
    }

    const prior = await this.messages
      .find({
        contactId: contact._id,
        slotKey,
        direction: 'outbound',
        source: 'task_checklist',
        status: 'sent',
      })
      .exec();
    const doneIds = new Set(
      prior.map((row) => row.taskId).filter((id): id is string => Boolean(id)),
    );
    const nextIndex = tasks.findIndex((task) => !doneIds.has(task.taskId));
    if (nextIndex < 0) {
      return;
    }
    const task = tasks[nextIndex];
    const step = nextIndex + 1;
    const total = tasks.length;
    const labeledTitle = `Tarea ${step}/${total} · ${task.label}`;
    const body = `¿Cómo va la tarea "${task.label}"? Contanos el avance actual de la obra.`;
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
   * Legacy contacts without projectId stay eligible while a single active
   * obra is in scope (auto-stamped). Explicit mismatches stay excluded.
   */
  private async ensureContactInActiveProjects(
    contact: WhatsAppContactDocument,
    allowed: Set<string> | null,
  ): Promise<boolean> {
    if (!allowed) {
      return true;
    }
    const contactProject = contact.projectId?.trim();
    if (contactProject) {
      return allowed.has(contactProject);
    }
    if (allowed.size !== 1) {
      return false;
    }
    const onlyProject = [...allowed][0];
    contact.projectId = onlyProject;
    await this.contacts
      .findByIdAndUpdate(contact._id, { projectId: onlyProject })
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

  private async loadPendingObjectiveTasksForProject(
    projectId: string,
  ): Promise<{
    sourceId: Types.ObjectId;
    tasks: ReturnType<typeof extractPendingObjectiveTasks>;
  } | null> {
    const latest = await this.resolveSourceForProject(projectId);
    if (!latest) {
      return null;
    }
    return {
      sourceId: latest._id,
      tasks: extractPendingObjectiveTasks(latest.content),
    };
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
    ).sort(
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

  /** Match contacts even when WhatsApp JIDs omit/include country or mobile `9`. */
  private async findContactByPhone(
    phone: string,
  ): Promise<WhatsAppContactDocument | null> {
    const exact = await this.contacts.findOne({ phone }).exec();
    if (exact) {
      return exact;
    }

    const contacts = await this.contacts.find({ active: true }).exec();
    const needle = phone.replace(/\D/g, '');
    return (
      contacts.find((contact) => {
        const stored = contact.phone.replace(/\D/g, '');
        if (stored === needle) {
          return true;
        }
        const min = Math.min(stored.length, needle.length, 10);
        return min >= 8 && stored.slice(-min) === needle.slice(-min);
      }) ?? null
    );
  }

  private toObjectId(id: string, label: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`Invalid ${label} id.`);
    }
    return new Types.ObjectId(id);
  }
}
