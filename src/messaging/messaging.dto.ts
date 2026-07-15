import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateContactDto {
  @IsString()
  @Length(8, 20)
  phone!: string;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  label?: string;

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
