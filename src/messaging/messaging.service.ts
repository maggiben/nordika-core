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
import { EvolutionClient } from './evolution.client';
import {
  CreateCatalogMessageDto,
  CreateCicloDto,
  CreateContactDto,
  CreateTemplateDto,
  InboundMessageDto,
  SendCatalogMessageDto,
  StartFlowDto,
  TestSendDto,
  UpdateCatalogMessageDto,
  UpdateCicloDto,
  UpdateContactDto,
  UpdateTemplateDto,
  UpsertFlowDto,
  UpsertWorkStatusDto,
} from './messaging.dto';
import { FLOW_STEP_CAP, pickMatchingEdge } from './messaging.flow-match';
import { assertValidFlowGraph } from './messaging.flow-validate';
import {
  CICLO_MODEL,
  CicloDocument,
  InteractiveTemplateBody,
  MESSAGE_DISPATCH_MODEL,
  MESSAGE_FLOW_MODEL,
  MESSAGE_FLOW_RUN_MODEL,
  MESSAGE_TEMPLATE_MODEL,
  MessageDispatch,
  MessageDispatchDocument,
  MessageFlowDocument,
  MessageFlowNode,
  MessageFlowRunDocument,
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

export interface MessageFlowRow {
  _id: string;
  name: string;
  active: boolean;
  startNodeId: string;
  nodes: MessageFlowNode[];
  edges: Array<{
    id: string;
    fromNodeId: string;
    toNodeId: string;
    match: { type: 'equals' | 'contains' | 'any'; value: string };
  }>;
}

export interface MessageFlowRunRow {
  _id: string;
  flowId: string;
  contactId: string;
  currentNodeId: string;
  status: 'idle' | 'awaiting_reply' | 'completed' | 'failed';
  stepCount: number;
  lastOutboundMessageId: string | null;
}

@Injectable()
export class MessagingService {
  private readonly logger = new Logger(MessagingService.name);
  private readonly replyMatchWindowMs = 7 * 24 * 60 * 60 * 1000;
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
    @InjectModel(MESSAGE_FLOW_MODEL)
    private readonly flows: Model<MessageFlowDocument>,
    @InjectModel(MESSAGE_FLOW_RUN_MODEL)
    private readonly flowRuns: Model<MessageFlowRunDocument>,
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
      if (item.save) {
        await item.save();
      }
    }
    await this.cache.invalidatePaths([MESSAGING_CACHE_PATHS.catalog]);
    return this.listCatalogMessages();
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

  async listFlows(): Promise<MessageFlowRow[]> {
    const docs = await this.flows
      .find({ active: true })
      .sort({ updatedAt: -1 })
      .exec();
    return docs.map((doc) => this.toFlowRow(doc));
  }

  async getFlow(id: string): Promise<MessageFlowRow> {
    const doc = await this.flows.findById(this.toObjectId(id, 'flow')).exec();
    if (!doc) {
      throw new NotFoundException('Flow not found.');
    }
    return this.toFlowRow(doc);
  }

  async createFlow(dto: UpsertFlowDto): Promise<MessageFlowRow> {
    assertValidFlowGraph(dto);
    const nodes = await this.hydrateFlowNodes(dto.nodes);
    assertValidFlowGraph({ ...dto, nodes });
    const created = await this.flows.create({
      name: dto.name.trim(),
      active: dto.active ?? true,
      startNodeId: dto.startNodeId.trim(),
      nodes,
      edges: dto.edges,
    });
    await this.cache.invalidatePaths([MESSAGING_CACHE_PATHS.flows]);
    return this.toFlowRow(created);
  }

  async updateFlow(id: string, dto: UpsertFlowDto): Promise<MessageFlowRow> {
    assertValidFlowGraph(dto);
    const nodes = await this.hydrateFlowNodes(dto.nodes);
    assertValidFlowGraph({ ...dto, nodes });
    const doc = await this.flows.findById(this.toObjectId(id, 'flow')).exec();
    if (!doc) {
      throw new NotFoundException('Flow not found.');
    }
    doc.name = dto.name.trim();
    doc.active = dto.active ?? doc.active;
    doc.startNodeId = dto.startNodeId.trim();
    doc.nodes = nodes;
    doc.edges = dto.edges;
    if (doc.save) {
      await doc.save();
    }
    await this.cache.invalidatePaths([MESSAGING_CACHE_PATHS.flows]);
    return this.toFlowRow(doc);
  }

  async deleteFlow(id: string): Promise<{ ok: true }> {
    const doc = await this.flows.findById(this.toObjectId(id, 'flow')).exec();
    if (!doc) {
      throw new NotFoundException('Flow not found.');
    }
    doc.active = false;
    if (doc.save) {
      await doc.save();
    }
    await this.cache.invalidatePaths([MESSAGING_CACHE_PATHS.flows]);
    return { ok: true };
  }

  async listFlowRuns(contactId?: string): Promise<MessageFlowRunRow[]> {
    const filter: Record<string, unknown> = {};
    if (contactId?.trim()) {
      filter.contactId = this.toObjectId(contactId, 'contact');
    }
    const docs = await this.flowRuns
      .find(filter)
      .sort({ updatedAt: -1 })
      .limit(100)
      .exec();
    return docs.map((doc) => this.toFlowRunRow(doc));
  }

  async getFlowRun(id: string): Promise<MessageFlowRunRow> {
    const doc = await this.flowRuns
      .findById(this.toObjectId(id, 'flow run'))
      .exec();
    if (!doc) {
      throw new NotFoundException('Flow run not found.');
    }
    return this.toFlowRunRow(doc);
  }

  async startFlow(
    id: string,
    dto: StartFlowDto,
  ): Promise<{
    ok: true;
    flowId: string;
    runId: string;
    phone: string;
    threadId: string;
    providerMessageId?: string;
  }> {
    if (!this.evolution.isConfigured()) {
      throw new ServiceUnavailableException(
        'WhatsApp messaging is not configured (Evolution API).',
      );
    }

    const flow = await this.flows.findById(this.toObjectId(id, 'flow')).exec();
    if (!flow || !flow.active) {
      throw new NotFoundException('Flow not found.');
    }
    assertValidFlowGraph(flow);

    const contact = await this.contacts
      .findById(this.toObjectId(dto.contactId, 'contact'))
      .exec();
    if (!contact || !contact.active) {
      throw new NotFoundException('Contact not found.');
    }

    const existing = await this.flowRuns
      .findOne({
        contactId: contact._id,
        status: 'awaiting_reply',
      })
      .exec();
    if (existing) {
      throw new ConflictException(
        'Contact already has an active flow awaiting reply.',
      );
    }

    const startNode = flow.nodes.find((node) => node.id === flow.startNodeId);
    if (!startNode) {
      throw new BadRequestException('Flow start node is missing.');
    }

    const run = await this.flowRuns.create({
      flowId: flow._id,
      contactId: contact._id,
      currentNodeId: startNode.id,
      status: 'awaiting_reply',
      stepCount: 0,
    });

    try {
      const sent = await this.sendFlowNodeMessage({
        flow,
        run,
        contact,
        node: startNode,
      });
      run.stepCount = 1;
      run.currentNodeId = startNode.id;
      run.lastOutboundMessageId = sent._id;
      const outgoing = flow.edges.filter(
        (edge) => edge.fromNodeId === startNode.id,
      );
      run.status = outgoing.length ? 'awaiting_reply' : 'completed';
      if (run.save) {
        await run.save();
      }
      await this.cache.invalidatePaths([MESSAGING_CACHE_PATHS.flows]);
      return {
        ok: true,
        flowId: String(flow._id),
        runId: String(run._id),
        phone: contact.phone,
        threadId: String(sent.threadId ?? sent._id),
        providerMessageId: sent.providerMessageId,
      };
    } catch (error) {
      run.status = 'failed';
      if (run.save) {
        await run.save();
      }
      throw error;
    }
  }

  async sendCatalogMessage(
    id: string,
    dto: SendCatalogMessageDto = {},
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

    const sentAt = new Date();
    const siblings = catalogMessage.assignedContactId
      ? await this.catalog
          .find({
            active: true,
            assignedContactId: catalogMessage.assignedContactId,
          })
          .exec()
      : [catalogMessage];
    const total = Math.max(1, siblings.length);
    const step = Math.max(1, catalogMessage.sortOrder || 1);
    const labeledTitle = `${step}/${total} · ${catalogMessage.title}`;
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

    return {
      phone,
      body: conversation || '(respuesta recibida)',
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
    const replyBody =
      (dto.body ?? dto.text ?? '').trim() || '(respuesta recibida)';
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

    const recentOutbound = await this.messages
      .find({
        contactId: contact._id,
        direction: 'outbound',
        status: 'sent',
      })
      .sort({ sentAt: -1, createdAt: -1 })
      .limit(25)
      .exec();
    const windowStart = repliedAt.getTime() - this.replyMatchWindowMs;
    const openCandidates = recentOutbound.filter((item) => {
      if (item.repliedAt) {
        return false;
      }
      const sentAt =
        item.sentAt ??
        (item as StaffMessageDocument & { createdAt?: Date }).createdAt;
      if (!sentAt) {
        return false;
      }
      return sentAt.getTime() >= windowStart;
    });
    const openThread =
      openCandidates.find(
        (item) => item.source === 'flow' && Boolean(item.flowRunId),
      ) ?? openCandidates[0];

    let responseLatencyMs: number | null = null;
    let responseStatus: StaffResponseTrafficLight | null = null;
    let threadId: Types.ObjectId | null = null;

    if (openThread?.sentAt) {
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

    await this.recordStaffMessage({
      contactId: contact._id,
      phone: contact.phone,
      direction: 'inbound',
      body: replyBody,
      status: 'received',
      providerMessageId: dto.providerMessageId,
      receivedAt: repliedAt,
      repliedAt,
      threadId: threadId ?? undefined,
      source: 'webhook',
      catalogMessageId: openThread?.catalogMessageId,
      flowId: openThread?.flowId,
      flowRunId: openThread?.flowRunId,
      flowNodeId: openThread?.flowNodeId,
      title: openThread?.title,
      responseLatencyMs: responseLatencyMs ?? undefined,
      responseStatus: responseStatus ?? undefined,
    });

    if (openThread?.flowRunId) {
      try {
        await this.advanceFlowAfterReply(openThread, replyBody);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown flow advance error';
        this.logger.error(
          `Failed to advance flow run ${String(openThread.flowRunId)}: ${message}`,
        );
      }
    } else if (
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
    }

    await this.cache.invalidatePaths([
      MESSAGING_CACHE_PATHS.roster,
      MESSAGING_CACHE_PATHS.catalog,
      MESSAGING_CACHE_PATHS.flows,
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
   * 2) WhatsApp re-send of every active assigned catalog message (“Mensajes del equipo”)
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

    if (claimed > 0 && this.evolution.isConfigured()) {
      const catalogResult = await this.sendAssignedCatalogMessages();
      catalogSent = catalogResult.sent;
      catalogFailed = catalogResult.failed;

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

  /** Re-send every active catalog message that has an assigned staff contact. */
  async sendAssignedCatalogMessages(): Promise<{
    sent: number;
    failed: number;
    skipped: number;
  }> {
    if (!this.evolution.isConfigured()) {
      return { sent: 0, failed: 0, skipped: 0 };
    }

    const items = await this.catalog
      .find({
        active: true,
        assignedContactId: { $exists: true, $ne: null },
      })
      .exec();

    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const item of items) {
      if (!item.assignedContactId) {
        skipped += 1;
        continue;
      }
      try {
        await this.sendCatalogMessage(String(item._id), {
          contactId: String(item.assignedContactId),
        });
        sent += 1;
      } catch (error) {
        failed += 1;
        this.logger.warn(
          `Scheduled catalog send failed for ${String(item._id)}: ${
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

  private async advanceFlowAfterReply(
    outbound: StaffMessageDocument,
    replyBody: string,
  ): Promise<void> {
    if (!outbound.flowRunId) {
      return;
    }
    const run = await this.flowRuns.findById(outbound.flowRunId).exec();
    if (!run || run.status !== 'awaiting_reply') {
      return;
    }
    const flow = await this.flows.findById(run.flowId).exec();
    if (!flow || !flow.active) {
      run.status = 'failed';
      if (run.save) {
        await run.save();
      }
      return;
    }

    const fromNodeId = outbound.flowNodeId ?? run.currentNodeId;
    const outgoing = flow.edges.filter(
      (edge) => edge.fromNodeId === fromNodeId,
    );
    const matched = pickMatchingEdge(replyBody, outgoing);
    if (!matched) {
      return;
    }

    if (run.stepCount >= FLOW_STEP_CAP) {
      run.status = 'failed';
      if (run.save) {
        await run.save();
      }
      this.logger.warn(
        `Flow run ${String(run._id)} hit step cap (${FLOW_STEP_CAP}).`,
      );
      return;
    }

    const nextNode = flow.nodes.find((node) => node.id === matched.toNodeId);
    if (!nextNode) {
      run.status = 'failed';
      if (run.save) {
        await run.save();
      }
      return;
    }

    const contact = await this.contacts.findById(run.contactId).exec();
    if (!contact || !contact.active) {
      run.status = 'failed';
      if (run.save) {
        await run.save();
      }
      return;
    }

    try {
      const sent = await this.sendFlowNodeMessage({
        flow,
        run,
        contact,
        node: nextNode,
      });
      run.stepCount += 1;
      run.currentNodeId = nextNode.id;
      run.lastOutboundMessageId = sent._id;
      const nextOutgoing = flow.edges.filter(
        (edge) => edge.fromNodeId === nextNode.id,
      );
      run.status = nextOutgoing.length ? 'awaiting_reply' : 'completed';
      if (run.save) {
        await run.save();
      }
    } catch (error) {
      run.status = 'failed';
      if (run.save) {
        await run.save();
      }
      throw error;
    }
  }

  private async hydrateFlowNodes(
    nodes: UpsertFlowDto['nodes'],
  ): Promise<MessageFlowNode[]> {
    const resolved: MessageFlowNode[] = [];
    for (const node of nodes) {
      const catalogId = node.catalogMessageId?.trim();
      if (!catalogId) {
        resolved.push({
          id: node.id.trim(),
          title: node.title.trim(),
          body: node.body.trim(),
          position: { x: node.position.x, y: node.position.y },
        });
        continue;
      }
      const catalog = await this.catalog
        .findById(this.toObjectId(catalogId, 'catalog message'))
        .exec();
      if (!catalog || !catalog.active) {
        throw new BadRequestException(
          `Catalog message ${catalogId} was not found or is inactive.`,
        );
      }
      resolved.push({
        id: node.id.trim(),
        catalogMessageId: String(catalog._id),
        title: catalog.title,
        body: catalog.body,
        position: { x: node.position.x, y: node.position.y },
      });
    }
    return resolved;
  }

  private async sendFlowNodeMessage(input: {
    flow: MessageFlowDocument;
    run: MessageFlowRunDocument;
    contact: WhatsAppContactDocument;
    node: MessageFlowNode;
  }): Promise<StaffMessageDocument> {
    if (!this.evolution.isConfigured()) {
      throw new ServiceUnavailableException(
        'WhatsApp messaging is not configured (Evolution API).',
      );
    }

    const { flow, run, contact, node } = input;
    let title = node.title;
    let body = node.body;
    let catalogObjectId: Types.ObjectId | undefined;
    if (node.catalogMessageId?.trim()) {
      const catalog = await this.catalog
        .findById(this.toObjectId(node.catalogMessageId, 'catalog message'))
        .exec();
      if (!catalog || !catalog.active) {
        throw new BadRequestException(
          `Catalog message ${node.catalogMessageId} was not found or is inactive.`,
        );
      }
      title = catalog.title;
      body = catalog.body;
      catalogObjectId = catalog._id;
    }

    const step = Math.max(1, run.stepCount + 1);
    const total = Math.max(1, flow.nodes.length);
    const labeledTitle = `${step}/${total} · ${title}`;
    const sentAt = new Date();
    const interactive: InteractiveTemplateBody = {
      text: body,
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
        body,
        language,
      );
      return this.recordStaffMessage({
        contactId: contact._id,
        phone: contact.phone,
        direction: 'outbound',
        title: labeledTitle,
        body,
        status: 'sent',
        providerMessageId: result.providerMessageId,
        sentAt,
        receivedAt: sentAt,
        responseStatus: 'pending',
        source: 'flow',
        flowId: flow._id,
        flowRunId: run._id,
        flowNodeId: node.id,
        catalogMessageId: catalogObjectId,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown send error';
      await this.recordStaffMessage({
        contactId: contact._id,
        phone: contact.phone,
        direction: 'outbound',
        title: labeledTitle,
        body,
        status: 'failed',
        error: message,
        sentAt,
        source: 'flow',
        flowId: flow._id,
        flowRunId: run._id,
        flowNodeId: node.id,
        catalogMessageId: catalogObjectId,
        responseStatus: 'neutral',
      });
      throw error;
    }
  }

  private toFlowRow(doc: MessageFlowDocument): MessageFlowRow {
    return {
      _id: String(doc._id),
      name: doc.name,
      active: doc.active,
      startNodeId: doc.startNodeId,
      nodes: doc.nodes.map((node) => ({
        id: node.id,
        title: node.title,
        body: node.body,
        catalogMessageId: node.catalogMessageId,
        position: { x: node.position.x, y: node.position.y },
      })),
      edges: doc.edges.map((edge) => ({
        id: edge.id,
        fromNodeId: edge.fromNodeId,
        toNodeId: edge.toNodeId,
        match: {
          type: edge.match.type,
          value: edge.match.value,
        },
      })),
    };
  }

  private toFlowRunRow(doc: MessageFlowRunDocument): MessageFlowRunRow {
    return {
      _id: String(doc._id),
      flowId: String(doc.flowId),
      contactId: String(doc.contactId),
      currentNodeId: doc.currentNodeId,
      status: doc.status,
      stepCount: doc.stepCount,
      lastOutboundMessageId: doc.lastOutboundMessageId
        ? String(doc.lastOutboundMessageId)
        : null,
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
    let responseStatus: string = 'neutral';
    if (last?.repliedAt && latencyMs !== null) {
      responseStatus = responseStatusFromLatencyMs(latencyMs);
    } else if (last?.repliedAt && sentAt) {
      responseStatus = responseStatusFromLatencyMs(
        computeResponseLatencyMs(sentAt, last.repliedAt),
      );
    } else if (last && !last.repliedAt && sentAt) {
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
      repliedAt: last?.repliedAt ? last.repliedAt.toISOString() : null,
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
      const nextOrder = index + 1;
      if (siblings[index].sortOrder !== nextOrder) {
        siblings[index].sortOrder = nextOrder;
        if (siblings[index].save) {
          await siblings[index].save();
        }
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
        list[index].sortOrder = index + 1;
        if (list[index].save) {
          await list[index].save();
        }
      }
    }
  }

  private async advanceCatalogAfterReply(
    openThread: StaffMessageDocument,
  ): Promise<void> {
    if (!openThread.catalogMessageId) {
      return;
    }
    const current = await this.catalog
      .findById(openThread.catalogMessageId)
      .exec();
    if (!current?.assignedContactId || !current.active) {
      return;
    }
    const nextOrder = (current.sortOrder ?? 0) + 1;
    if (nextOrder < 2) {
      return;
    }
    const next = (
      await this.catalog
        .find({
          active: true,
          assignedContactId: current.assignedContactId,
        })
        .exec()
    ).find((item) => (item.sortOrder ?? 0) === nextOrder);
    if (!next) {
      return;
    }
    await this.sendCatalogMessage(String(next._id), {
      contactId: String(current.assignedContactId),
    });
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
