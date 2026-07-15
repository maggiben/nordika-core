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

export interface StaffMessage {
  contactId: Types.ObjectId;
  phone: string;
  direction: 'outbound' | 'inbound';
  /** Full message title when known (catalog / template name). Never truncated. */
  title?: string;
  templateKey?: string;
  catalogMessageId?: Types.ObjectId;
  flowId?: Types.ObjectId;
  flowRunId?: Types.ObjectId;
  flowNodeId?: string;
  /** Root outbound message id for this conversation turn. */
  threadId?: Types.ObjectId;
  /** Full WhatsApp body text. Never truncated in storage. */
  body: string;
  /** Full staff reply text when this outbound thread was answered. */
  replyBody?: string;
  status: 'sent' | 'failed' | 'received';
  providerMessageId?: string;
  error?: string;
  source?: 'test' | 'remind' | 'dispatch' | 'catalog' | 'webhook' | 'flow';
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
  active: boolean;
}

export type FlowMatchType = 'equals' | 'contains' | 'any';

export interface MessageFlowNode {
  id: string;
  title: string;
  body: string;
  position: { x: number; y: number };
  /** When set, send resolves live copy from StaffCatalogMessage. */
  catalogMessageId?: string;
}

export interface MessageFlowEdge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  match: { type: FlowMatchType; value: string };
}

export interface MessageFlow {
  name: string;
  active: boolean;
  startNodeId: string;
  nodes: MessageFlowNode[];
  edges: MessageFlowEdge[];
}

export type MessageFlowRunStatus =
  'idle' | 'awaiting_reply' | 'completed' | 'failed';

export interface MessageFlowRun {
  flowId: Types.ObjectId;
  contactId: Types.ObjectId;
  currentNodeId: string;
  status: MessageFlowRunStatus;
  stepCount: number;
  lastOutboundMessageId?: Types.ObjectId;
}

export type WhatsAppContactDocument = HydratedDocument<WhatsAppContact>;
export type MessageTemplateDocument = HydratedDocument<MessageTemplate>;
export type CicloDocument = HydratedDocument<Ciclo>;
export type WorkStatusDocument = HydratedDocument<WorkStatus>;
export type MessageDispatchDocument = HydratedDocument<MessageDispatch>;
export type StaffMessageDocument = HydratedDocument<StaffMessage>;
export type StaffCatalogMessageDocument = HydratedDocument<StaffCatalogMessage>;
export type MessageFlowDocument = HydratedDocument<MessageFlow>;
export type MessageFlowRunDocument = HydratedDocument<MessageFlowRun>;

export const WHATSAPP_CONTACT_MODEL = 'WhatsAppContact';
export const MESSAGE_TEMPLATE_MODEL = 'MessageTemplate';
export const CICLO_MODEL = 'Ciclo';
export const WORK_STATUS_MODEL = 'WorkStatus';
export const MESSAGE_DISPATCH_MODEL = 'MessageDispatch';
export const STAFF_MESSAGE_MODEL = 'StaffMessage';
export const STAFF_CATALOG_MESSAGE_MODEL = 'StaffCatalogMessage';
export const MESSAGE_FLOW_MODEL = 'MessageFlow';
export const MESSAGE_FLOW_RUN_MODEL = 'MessageFlowRun';
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
      flowId: {
        type: Schema.Types.ObjectId,
        ref: MESSAGE_FLOW_MODEL,
        index: true,
      },
      flowRunId: {
        type: Schema.Types.ObjectId,
        ref: MESSAGE_FLOW_RUN_MODEL,
        index: true,
      },
      flowNodeId: { type: String, trim: true },
      threadId: {
        type: Schema.Types.ObjectId,
        ref: STAFF_MESSAGE_MODEL,
        index: true,
      },
      body: { type: String, required: true },
      replyBody: { type: String },
      status: {
        type: String,
        required: true,
        enum: ['sent', 'failed', 'received'],
      },
      providerMessageId: String,
      error: String,
      source: {
        type: String,
        enum: ['test', 'remind', 'dispatch', 'catalog', 'webhook', 'flow'],
      },
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
      active: { type: Boolean, required: true, default: true },
    },
    { timestamps: true },
  );

export const messageFlowSchema: Schema<MessageFlow> = new Schema<MessageFlow>(
  {
    name: { type: String, required: true, trim: true },
    active: { type: Boolean, required: true, default: true },
    startNodeId: { type: String, required: true, trim: true },
    nodes: {
      type: [
        {
          id: { type: String, required: true },
          title: { type: String, required: true },
          body: { type: String, required: true },
          catalogMessageId: { type: String, trim: true },
          position: {
            x: { type: Number, required: true },
            y: { type: Number, required: true },
          },
        },
      ],
      required: true,
      default: [],
    },
    edges: {
      type: [
        {
          id: { type: String, required: true },
          fromNodeId: { type: String, required: true },
          toNodeId: { type: String, required: true },
          match: {
            type: {
              type: String,
              required: true,
              enum: ['equals', 'contains', 'any'],
            },
            value: { type: String, required: true },
          },
        },
      ],
      required: true,
      default: [],
    },
  },
  { timestamps: true },
);

export const messageFlowRunSchema: Schema<MessageFlowRun> =
  new Schema<MessageFlowRun>(
    {
      flowId: {
        type: Schema.Types.ObjectId,
        ref: MESSAGE_FLOW_MODEL,
        required: true,
        index: true,
      },
      contactId: {
        type: Schema.Types.ObjectId,
        ref: WHATSAPP_CONTACT_MODEL,
        required: true,
        index: true,
      },
      currentNodeId: { type: String, required: true, trim: true },
      status: {
        type: String,
        required: true,
        enum: ['idle', 'awaiting_reply', 'completed', 'failed'],
      },
      stepCount: { type: Number, required: true, default: 0, min: 0 },
      lastOutboundMessageId: {
        type: Schema.Types.ObjectId,
        ref: STAFF_MESSAGE_MODEL,
      },
    },
    { timestamps: true },
  );
messageFlowRunSchema.index(
  { contactId: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: 'awaiting_reply' } },
);
