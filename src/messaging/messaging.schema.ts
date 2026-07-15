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

export type WhatsAppContactDocument = HydratedDocument<WhatsAppContact>;
export type MessageTemplateDocument = HydratedDocument<MessageTemplate>;
export type CicloDocument = HydratedDocument<Ciclo>;
export type WorkStatusDocument = HydratedDocument<WorkStatus>;
export type MessageDispatchDocument = HydratedDocument<MessageDispatch>;

export const WHATSAPP_CONTACT_MODEL = 'WhatsAppContact';
export const MESSAGE_TEMPLATE_MODEL = 'MessageTemplate';
export const CICLO_MODEL = 'Ciclo';
export const WORK_STATUS_MODEL = 'WorkStatus';
export const MESSAGE_DISPATCH_MODEL = 'MessageDispatch';

export const whatsAppContactSchema = new Schema<WhatsAppContact>(
  {
    phone: { type: String, required: true, unique: true, trim: true },
    label: { type: String, trim: true },
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

export const messageDispatchSchema = new Schema<MessageDispatch>(
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
