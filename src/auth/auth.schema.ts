import { HydratedDocument, Schema, Types } from 'mongoose';

export interface EmailNotificationSchedule {
  enabled: boolean;
  frequency: 'weekly' | 'monthly';
  daysOfWeek: number[];
  dayOfMonth: number;
  sendTime: string;
  timezone: string;
}

export interface Account {
  email: string;
  emailVerifiedAt?: Date;
  identities: { provider: string; subject: string }[];
  roles: string[];
  language?: string;
  emailNotificationSchedule?: EmailNotificationSchedule;
}
export interface LocalCredential {
  accountId: Types.ObjectId;
  salt: string;
  passwordHash: string;
}
export interface RefreshSession {
  accountId: Types.ObjectId;
  tokenHash: string;
  expiresAt: Date;
  revokedAt?: Date;
  replacedByHash?: string;
}
export interface EmailActionToken {
  accountId: Types.ObjectId;
  tokenHash: string;
  purpose: 'verify_email' | 'reset_password';
  expiresAt: Date;
  consumedAt?: Date;
}

export type AccountDocument = HydratedDocument<Account>;
export const ACCOUNT_MODEL = 'Account';
export const LOCAL_CREDENTIAL_MODEL = 'LocalCredential';
export const REFRESH_SESSION_MODEL = 'RefreshSession';
export const EMAIL_ACTION_TOKEN_MODEL = 'EmailActionToken';

export const accountSchema = new Schema<Account>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    emailVerifiedAt: Date,
    identities: [
      {
        provider: { type: String, required: true },
        subject: { type: String, required: true },
      },
    ],
    roles: { type: [String], required: true },
    language: {
      type: String,
      enum: ['es', 'en'],
      default: 'es',
      trim: true,
    },
    emailNotificationSchedule: {
      enabled: { type: Boolean, default: false },
      frequency: {
        type: String,
        enum: ['weekly', 'monthly'],
        default: 'weekly',
      },
      daysOfWeek: { type: [Number], default: [1] },
      dayOfMonth: { type: Number, default: 1, min: 1, max: 28 },
      sendTime: { type: String, default: '09:00' },
      timezone: {
        type: String,
        default: 'America/Argentina/Buenos_Aires',
      },
    },
  },
  { timestamps: true },
);
export const localCredentialSchema = new Schema<LocalCredential>(
  {
    accountId: {
      type: Schema.Types.ObjectId,
      ref: ACCOUNT_MODEL,
      unique: true,
      required: true,
    },
    salt: { type: String, required: true },
    passwordHash: { type: String, required: true },
  },
  { timestamps: true },
);
export const refreshSessionSchema = new Schema<RefreshSession>(
  {
    accountId: {
      type: Schema.Types.ObjectId,
      ref: ACCOUNT_MODEL,
      required: true,
    },
    tokenHash: { type: String, unique: true, required: true },
    expiresAt: { type: Date, required: true },
    revokedAt: Date,
    replacedByHash: String,
  },
  { timestamps: true },
);
refreshSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const emailActionTokenSchema = new Schema<EmailActionToken>(
  {
    accountId: {
      type: Schema.Types.ObjectId,
      ref: ACCOUNT_MODEL,
      required: true,
    },
    tokenHash: { type: String, unique: true, required: true },
    purpose: {
      type: String,
      enum: ['verify_email', 'reset_password'],
      required: true,
    },
    expiresAt: { type: Date, required: true },
    consumedAt: Date,
  },
  { timestamps: true },
);
emailActionTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
