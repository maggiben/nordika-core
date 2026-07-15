import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { MESSAGING_CACHE_PATHS } from '../cache/cache.constants';
import { OptionalCacheService } from '../cache/optional-cache.service';
import { EvolutionClient } from './evolution.client';
import {
  CreateCicloDto,
  CreateContactDto,
  CreateTemplateDto,
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
  TemplateWidget,
  WHATSAPP_CONTACT_MODEL,
  WORK_STATUS_MODEL,
  WhatsAppContactDocument,
  WorkStatusDocument,
} from './messaging.schema';
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

@Injectable()
export class MessagingService {
  private readonly logger = new Logger(MessagingService.name);

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
    private readonly evolution: EvolutionClient,
    private readonly cache: OptionalCacheService,
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
      active: dto.active ?? true,
      tags: dto.tags ?? [],
    });
    await this.cache.invalidatePaths([MESSAGING_CACHE_PATHS.contacts]);
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
    await this.cache.invalidatePaths([MESSAGING_CACHE_PATHS.contacts]);
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

  async listTemplates(): Promise<MessageTemplateDocument[]> {
    return this.templates.find().sort({ createdAt: -1 }).exec();
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

    const template = await this.templates
      .findOne({ key: dto.templateKey, active: true })
      .exec();
    if (!template) {
      throw new BadRequestException(
        `Active template "${dto.templateKey}" was not found.`,
      );
    }

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
      const template = await this.templates
        .findOne({ key: dto.templateKey, active: true })
        .exec();
      if (!template) {
        throw new BadRequestException(
          `Active template "${dto.templateKey}" was not found.`,
        );
      }
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
      const template = await this.templates
        .findOne({ key: ciclo.templateKey, active: true })
        .exec();

      let sent = 0;
      let failed = 0;
      let skipped = 0;

      if (!template || !status) {
        this.logger.warn(
          `Skipping ciclo ${String(ciclo._id)} week ${weekNumber}: missing ${
            !template ? 'template' : 'work status'
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
            error: !template
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

      const renderedText = renderTemplateText(template.body.text, {
        percent: String(status.percent),
        duration: status.duration ?? '',
        avance: status.avance ?? '',
        ciclo_inicio: formatDateOnly(ciclo.ciclo_inicio),
        ciclo_fin: formatDateOnly(ciclo.ciclo_fin),
        week: String(weekNumber),
        ciclo_name: ciclo.name,
        notes: status.notes ?? '',
      });

      const renderedBody: InteractiveTemplateBody = {
        ...template.body,
        text: renderedText,
        title: template.body.title
          ? renderTemplateText(template.body.title, {
              percent: String(status.percent),
              duration: status.duration ?? '',
              avance: status.avance ?? '',
              ciclo_inicio: formatDateOnly(ciclo.ciclo_inicio),
              ciclo_fin: formatDateOnly(ciclo.ciclo_fin),
              week: String(weekNumber),
              ciclo_name: ciclo.name,
              notes: status.notes ?? '',
            })
          : template.body.title,
      };

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

        try {
          await this.evolution.sendInteractive(
            contact.phone,
            renderedBody,
            renderedText,
          );
          await this.recordDispatch({
            cicloId: ciclo._id,
            contactId: contact._id,
            phone: contact.phone,
            templateKey: template.key,
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
            templateKey: template.key,
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

  private toObjectId(id: string, label: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`Invalid ${label} id.`);
    }
    return new Types.ObjectId(id);
  }
}
