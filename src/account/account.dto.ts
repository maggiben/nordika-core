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
} from 'class-validator';

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
}

export class ChangePasswordDto {
  @IsString()
  @Length(12, 128)
  currentPassword!: string;

  @IsString()
  @Length(12, 128)
  newPassword!: string;
}
