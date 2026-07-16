import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  ANTHROPIC_PROGRESS_MODELS,
  OPENAI_PROGRESS_MODELS,
} from './progress-ai';

const ALLOWED_PROGRESS_AI_MODELS = [
  ...OPENAI_PROGRESS_MODELS,
  ...ANTHROPIC_PROGRESS_MODELS,
] as string[];

export class ProgressAiSettingsDto {
  @IsIn(['openai', 'anthropic'])
  provider!: 'openai' | 'anthropic';

  @IsString()
  @IsIn(ALLOWED_PROGRESS_AI_MODELS)
  model!: string;

  /** Omit to leave unchanged; non-empty string to set; null to clear. */
  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsString()
  @Length(1, 512)
  openaiApiKey?: string | null;

  /** Omit to leave unchanged; non-empty string to set; null to clear. */
  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsString()
  @Length(1, 512)
  anthropicApiKey?: string | null;
}

export class UpdateAccountSettingsDto {
  @IsOptional()
  @IsIn(['es', 'en'])
  language?: 'es' | 'en';

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsIn(['weekly', 'monthly'])
  frequency?: 'weekly' | 'monthly';

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  daysOfWeek?: number[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(28)
  dayOfMonth?: number;

  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  sendTime?: string;

  @IsOptional()
  @IsString()
  @Length(3, 64)
  timezone?: string;

  /** Set the active obra; pass null to clear. */
  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsString()
  @Length(1, 120)
  activeProjectId?: string | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => ProgressAiSettingsDto)
  progressAi?: ProgressAiSettingsDto;
}

/** @deprecated Prefer UpdateAccountSettingsDto; kept for backward-compatible payloads. */
export class UpdateEmailScheduleDto {
  @IsBoolean()
  enabled!: boolean;

  @IsIn(['weekly', 'monthly'])
  frequency!: 'weekly' | 'monthly';

  @IsArray()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  daysOfWeek!: number[];

  @IsInt()
  @Min(1)
  @Max(28)
  dayOfMonth!: number;

  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  sendTime!: string;

  @IsOptional()
  @IsString()
  @Length(3, 64)
  timezone?: string;

  @IsOptional()
  @IsIn(['es', 'en'])
  language?: 'es' | 'en';
}

export class ChangePasswordDto {
  @IsString()
  @Length(12, 128)
  currentPassword!: string;

  @IsString()
  @Length(12, 128)
  newPassword!: string;
}
