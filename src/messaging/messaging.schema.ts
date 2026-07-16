import { HydratedDocument, Schema, Types } from 'mongoose';

export type TemplateWidget =
  | {
      type: 'button';
      id: string;
      label: string;
      action?: 'reply' | 'url' | 'call';
      url?: string;
      phoneNumber?: string;
    }
  | {
      type: 'input';
      id: string;
      label: string;
      placeholder?: string;
    }
  | {
      type: 'checkbox';
      id: string;
      label: string;
      options: { id: string; label: string }[];
    };

export interface InteractiveTemplateBody {
  text: string;
  title?: string;
  footer?: string;
  widgets: TemplateWidget[];
}

export interface WhatsAppContact {
  phone: string;
  label?: string;
  language?: string;
  active: boolean;
  tags: string[];
  /**
   * Nodika obras this jefe belongs to. Dispatch when any id matches the
   * account active project.
   */
  projectIds?: string[];
  /**
   * @deprecated Prefer `projectIds`. Kept for legacy documents / clients.
   */
  projectId?: string;
  /** Active catalog notification slot; replies before this cycle are ignored. */
  catalogSlotKey?: string;
  catalogSlotStartAt?: Date;
}

export interface MessageTemplate {
  key: string;
  name: string;
  description?: string;
  format: 'interactive_v1';
  body: InteractiveTemplateBody;
  active: boolean;
}

export interface Ciclo {
  name: string;
  ciclo_inicio: Date;
  ciclo_fin: Date;
  templateKey: string;
  active: boolean;
}

export interface WorkStatus {
  cicloId: Types.ObjectId;
  weekNumber: number;
  asOf: Date;
  percent: number;
  duration?: string;
  avance?: string;
  notes?: string;
}

export interface MessageDispatch {
  cicloId: Types.ObjectId;
  contactId: Types.ObjectId;
  phone: string;
  templateKey: string;
  weekNumber: number;
  status: 'sent' | 'failed' | 'skipped';
  renderedText: string;
  error?: string;
  sentAt?: Date;
}

export interface StaffParsedProgress {
  percent: number;
  duration?: string;
  avance?: string;
  notes?: string;
  byRole?: {
    jefe_obra?: number;
    operario?: number;
    jornalero?: number;
    otro?: number;
  };
  parsedAt: Date;
  model?: string;
}

export interface StaffMessage {
  contactId: Types.ObjectId;
  phone: string;
  direction: 'outbound' | 'inbound';
  /** Full message title when known (catalog / template name). Never truncated. */
  title?: string;
  templateKey?: string;
  catalogMessageId?: Types.ObjectId;
  /** Root outbound message id for this conversation turn. */
  threadId?: Types.ObjectId;
  /** Full WhatsApp body text. Never truncated in storage. */
  body: string;
  /**
   * On inbound replies: id of the outbound StaffMessage question this answers.
   */
  questionMessageId?: Types.ObjectId;
  /** Full staff reply text when this outbound thread was answered. */
  replyBody?: string;
  /** Structured progress extracted from replyBody (OpenAI). */
  parsedProgress?: StaffParsedProgress;
  status: 'sent' | 'failed' | 'received';
  providerMessageId?: string;
  error?: string;
  source?:
    'test' | 'remind' | 'dispatch' | 'catalog' | 'webhook' | 'task_checklist';
  /** Objective-task ask metadata (task_checklist source). */
  taskId?: string;
  taskLabel?: string;
  sourceId?: Types.ObjectId;
  /** Nodika obra id; partitions message history per source of truth. */
  projectId?: string;
  slotKey?: string;
  sentAt?: Date;
  /** When the recipient is considered to have received the outbound ask (usually sentAt). */
  receivedAt?: Date;
  repliedAt?: Date;
  /** repliedAt - sentAt in milliseconds; precise for AI analysis. */
  responseLatencyMs?: number;
  responseStatus?: 'green' | 'yellow' | 'red' | 'pending' | 'neutral';
}

export interface StaffCatalogMessage {
  title: string;
  /** Full message body. Never truncated in storage. */
  body: string;
  assignedContactId?: Types.ObjectId;
  /** 1-based order within the assigned contact bucket; 0 when unassigned. */
  sortOrder: number;
  active: boolean;
}

export type WhatsAppContactDocument = HydratedDocument<WhatsAppContact>;
export type MessageTemplateDocument = HydratedDocument<MessageTemplate>;
export type CicloDocument = HydratedDocument<Ciclo>;
export type WorkStatusDocument = HydratedDocument<WorkStatus>;
export type MessageDispatchDocument = HydratedDocument<MessageDispatch>;
export type StaffMessageDocument = HydratedDocument<StaffMessage>;
export type StaffCatalogMessageDocument = HydratedDocument<StaffCatalogMessage>;

export const WHATSAPP_CONTACT_MODEL = 'WhatsAppContact';
export const MESSAGE_TEMPLATE_MODEL = 'MessageTemplate';
export const CICLO_MODEL = 'Ciclo';
export const WORK_STATUS_MODEL = 'WorkStatus';
export const MESSAGE_DISPATCH_MODEL = 'MessageDispatch';
export const STAFF_MESSAGE_MODEL = 'StaffMessage';
export const STAFF_CATALOG_MESSAGE_MODEL = 'StaffCatalogMessage';
export const whatsAppContactSchema = new Schema<WhatsAppContact>(
  {
    phone: { type: String, required: true, unique: true, trim: true },
    label: { type: String, trim: true },
    language: {
      type: String,
      enum: ['es', 'en'],
      default: 'es',
      trim: true,
    },
    active: { type: Boolean, required: true, default: true },
    tags: { type: [String], required: true, default: [] },
    projectIds: { type: [String], default: [], index: true },
    projectId: { type: String, trim: true, index: true },
    catalogSlotKey: { type: String },
    catalogSlotStartAt: { type: Date },
  },
  { timestamps: true },
);

export const messageTemplateSchema = new Schema<MessageTemplate>(
  {
    key: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    format: {
      type: String,
      required: true,
      enum: ['interactive_v1'],
      default: 'interactive_v1',
    },
    body: {
      text: { type: String, required: true },
      title: String,
      footer: String,
      widgets: { type: [Schema.Types.Mixed], required: true, default: [] },
    },
    active: { type: Boolean, required: true, default: true },
  },
  { timestamps: true },
);

export const cicloSchema = new Schema<Ciclo>(
  {
    name: { type: String, required: true, trim: true },
    ciclo_inicio: { type: Date, required: true },
    ciclo_fin: { type: Date, required: true },
    templateKey: { type: String, required: true, trim: true },
    active: { type: Boolean, required: true, default: true },
  },
  { timestamps: true },
);

export const workStatusSchema = new Schema<WorkStatus>(
  {
    cicloId: {
      type: Schema.Types.ObjectId,
      ref: CICLO_MODEL,
      required: true,
    },
    weekNumber: { type: Number, required: true, min: 1 },
    asOf: { type: Date, required: true },
    percent: { type: Number, required: true, min: 0, max: 100 },
    duration: { type: String, trim: true },
    avance: { type: String, trim: true },
    notes: { type: String, trim: true },
  },
  { timestamps: true },
);
workStatusSchema.index({ cicloId: 1, weekNumber: 1 }, { unique: true });

export const messageDispatchSchema: Schema<MessageDispatch> =
  new Schema<MessageDispatch>(
    {
      cicloId: {
        type: Schema.Types.ObjectId,
        ref: CICLO_MODEL,
        required: true,
      },
      contactId: {
        type: Schema.Types.ObjectId,
        ref: WHATSAPP_CONTACT_MODEL,
        required: true,
      },
      phone: { type: String, required: true },
      templateKey: { type: String, required: true },
      weekNumber: { type: Number, required: true },
      status: {
        type: String,
        required: true,
        enum: ['sent', 'failed', 'skipped'],
      },
      renderedText: { type: String, required: true },
      error: String,
      sentAt: Date,
    },
    { timestamps: true },
  );
messageDispatchSchema.index({ cicloId: 1, weekNumber: 1, phone: 1 });

export const staffMessageSchema: Schema<StaffMessage> =
  new Schema<StaffMessage>(
    {
      contactId: {
        type: Schema.Types.ObjectId,
        ref: WHATSAPP_CONTACT_MODEL,
        required: true,
        index: true,
      },
      phone: { type: String, required: true, index: true },
      direction: {
        type: String,
        required: true,
        enum: ['outbound', 'inbound'],
      },
      title: { type: String, trim: true },
      templateKey: { type: String, trim: true },
      catalogMessageId: {
        type: Schema.Types.ObjectId,
        ref: STAFF_CATALOG_MESSAGE_MODEL,
        index: true,
      },
      threadId: {
        type: Schema.Types.ObjectId,
        ref: STAFF_MESSAGE_MODEL,
        index: true,
      },
      body: { type: String, required: true },
      questionMessageId: {
        type: Schema.Types.ObjectId,
        ref: STAFF_MESSAGE_MODEL,
        index: true,
      },
      replyBody: { type: String },
      parsedProgress: {
        percent: { type: Number, min: 0, max: 100 },
        duration: { type: String, trim: true },
        avance: { type: String, trim: true },
        notes: { type: String, trim: true },
        byRole: {
          jefe_obra: { type: Number, min: 0, max: 100 },
          operario: { type: Number, min: 0, max: 100 },
          jornalero: { type: Number, min: 0, max: 100 },
          otro: { type: Number, min: 0, max: 100 },
        },
        parsedAt: { type: Date },
        model: { type: String, trim: true },
      },
      status: {
        type: String,
        required: true,
        enum: ['sent', 'failed', 'received'],
      },
      providerMessageId: String,
      error: String,
      source: {
        type: String,
        enum: [
          'test',
          'remind',
          'dispatch',
          'catalog',
          'webhook',
          'task_checklist',
        ],
      },
      taskId: { type: String, trim: true, index: true },
      taskLabel: { type: String, trim: true },
      sourceId: {
        type: Schema.Types.ObjectId,
        ref: 'SourceOfTruth',
        index: true,
      },
      projectId: { type: String, trim: true, index: true },
      slotKey: { type: String, trim: true, index: true },
      sentAt: Date,
      receivedAt: Date,
      repliedAt: Date,
      responseLatencyMs: { type: Number, min: 0 },
      responseStatus: {
        type: String,
        enum: ['green', 'yellow', 'red', 'pending', 'neutral'],
      },
    },
    { timestamps: true },
  );
staffMessageSchema.index({ contactId: 1, direction: 1, createdAt: -1 });
staffMessageSchema.index({ phone: 1, direction: 1, createdAt: -1 });
staffMessageSchema.index({
  phone: 1,
  direction: 1,
  repliedAt: 1,
  sentAt: -1,
});
staffMessageSchema.index({ contactId: 1, slotKey: 1, taskId: 1, direction: 1 });

export const staffCatalogMessageSchema: Schema<StaffCatalogMessage> =
  new Schema<StaffCatalogMessage>(
    {
      title: { type: String, required: true, trim: true },
      body: { type: String, required: true },
      assignedContactId: {
        type: Schema.Types.ObjectId,
        ref: WHATSAPP_CONTACT_MODEL,
        index: true,
      },
      sortOrder: { type: Number, required: true, default: 0, min: 0 },
      active: { type: Boolean, required: true, default: true },
    },
    { timestamps: true },
  );
