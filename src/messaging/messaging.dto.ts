import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { normalizeLanguage } from '../i18n/languages';

function toDigitPhone(value: unknown): unknown {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return value;
  }
  return String(value).replace(/\D/g, '');
}

function toAppLanguage(value: unknown): unknown {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (typeof value !== 'string') {
    return value;
  }
  return normalizeLanguage(value);
}

export class CreateContactDto {
  @Transform(({ value }) => toDigitPhone(value))
  @IsString()
  @Matches(/^\d{8,20}$/, {
    message: 'phone must contain 8–20 digits (E.164 without +).',
  })
  phone!: string;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  label?: string;

  @IsOptional()
  @Transform(({ value }) => toAppLanguage(value))
  @IsIn(['es', 'en'])
  language?: 'es' | 'en';

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  tags?: string[];
}

export class UpdateContactDto {
  @IsOptional()
  @IsString()
  @Length(1, 120)
  label?: string;

  @IsOptional()
  @Transform(({ value }) => toAppLanguage(value))
  @IsIn(['es', 'en'])
  language?: 'es' | 'en';

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  tags?: string[];
}

export class TemplateBodyDto {
  @IsString()
  @Length(1, 4000)
  text!: string;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  title?: string;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  footer?: string;

  /** Widgets are validated in MessagingService (button | input | checkbox). */
  @IsArray()
  @ArrayMaxSize(20)
  widgets!: unknown[];
}

export class CreateTemplateDto {
  @IsString()
  @Length(1, 64)
  key!: string;

  @IsString()
  @Length(1, 120)
  name!: string;

  @IsOptional()
  @IsString()
  @Length(1, 500)
  description?: string;

  @ValidateNested()
  @Type(() => TemplateBodyDto)
  body!: TemplateBodyDto;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateTemplateDto {
  @IsOptional()
  @IsString()
  @Length(1, 120)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(1, 500)
  description?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => TemplateBodyDto)
  body?: TemplateBodyDto;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class CreateCicloDto {
  @IsString()
  @Length(1, 120)
  name!: string;

  @IsDateString()
  ciclo_inicio!: string;

  @IsDateString()
  ciclo_fin!: string;

  @IsString()
  @Length(1, 64)
  templateKey!: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateCicloDto {
  @IsOptional()
  @IsString()
  @Length(1, 120)
  name?: string;

  @IsOptional()
  @IsDateString()
  ciclo_inicio?: string;

  @IsOptional()
  @IsDateString()
  ciclo_fin?: string;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  templateKey?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpsertWorkStatusDto {
  @IsString()
  @Length(1, 64)
  cicloId!: string;

  @IsInt()
  @Min(1)
  weekNumber!: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  percent!: number;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  duration?: string;

  @IsOptional()
  @IsString()
  @Length(1, 500)
  avance?: string;

  @IsOptional()
  @IsString()
  @Length(1, 1000)
  notes?: string;

  @IsOptional()
  @IsDateString()
  asOf?: string;
}

export class RemindDto {
  @IsString()
  @Length(1, 64)
  contactId!: string;
}

export class InboundMessageDto {
  @IsString()
  @Length(8, 40)
  phone!: string;

  @IsOptional()
  @IsString()
  @Length(0, 4000)
  body?: string;

  @IsOptional()
  @IsString()
  @Length(0, 4000)
  text?: string;

  @IsOptional()
  @IsString()
  @Length(0, 120)
  providerMessageId?: string;
}

export class CreateCatalogMessageDto {
  @IsString()
  @Length(1, 160)
  title!: string;

  @IsString()
  @Length(1, 4000)
  body!: string;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  assignedContactId?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateCatalogMessageDto {
  @IsOptional()
  @IsString()
  @Length(1, 160)
  title?: string;

  @IsOptional()
  @IsString()
  @Length(1, 4000)
  body?: string;

  @IsOptional()
  @IsString()
  @Length(0, 64)
  assignedContactId?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class AssignCatalogMessageDto {
  @IsString()
  @Length(1, 64)
  contactId!: string;
}

export class ReorderCatalogMessagesDto {
  @IsString()
  @Length(1, 64)
  contactId!: string;

  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  orderedIds!: string[];
}

export class ResetCatalogSequenceDto {
  @IsString()
  @Length(1, 64)
  contactId!: string;
}

export class SendCatalogMessageDto {
  @IsOptional()
  @IsString()
  @Length(1, 64)
  contactId?: string;
}

export class TestSendDto {
  @Transform(({ value }) => toDigitPhone(value))
  @IsString()
  @Matches(/^\d{8,20}$/, {
    message: 'phone must contain 8–20 digits (E.164 without +).',
  })
  phone!: string;

  @IsString()
  @Length(1, 64)
  templateKey!: string;

  @IsOptional()
  @Transform(({ value }) => toAppLanguage(value))
  @IsIn(['es', 'en'])
  language?: 'es' | 'en';

  @IsOptional()
  @IsString()
  @Length(0, 120)
  percent?: string;

  @IsOptional()
  @IsString()
  @Length(0, 120)
  duration?: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  avance?: string;

  @IsOptional()
  @IsString()
  @Length(0, 1000)
  notes?: string;

  @IsOptional()
  @IsString()
  @Length(0, 32)
  week?: string;

  @IsOptional()
  @IsString()
  @Length(0, 120)
  ciclo_name?: string;

  @IsOptional()
  @IsString()
  @Length(0, 32)
  ciclo_inicio?: string;

  @IsOptional()
  @IsString()
  @Length(0, 32)
  ciclo_fin?: string;
}
