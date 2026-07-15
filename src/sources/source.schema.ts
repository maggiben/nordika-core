import { Schema } from 'mongoose';

export interface SourceOfTruth {
  filename: string;
  content: unknown;
  /** Nodika obra id from snapshot `meta.projectId`. */
  projectId?: string;
  createdAt: Date;
}

export const SOURCE_OF_TRUTH_MODEL = 'SourceOfTruth';

export const sourceOfTruthSchema = new Schema<SourceOfTruth>(
  {
    filename: { type: String, required: true },
    content: { type: Schema.Types.Mixed, required: true },
    projectId: { type: String, trim: true, index: true },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  },
);
