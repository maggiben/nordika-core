import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Account, ACCOUNT_MODEL } from '../auth/auth.schema';
import {
  DEFAULT_LANGUAGE,
  normalizeLanguage,
  type AppLanguage,
} from '../i18n/languages';
import {
  UpdateAccountSettingsDto,
  UpdateEmailScheduleDto,
} from './account.dto';
import { computeNextSendDates, normalizeSchedule } from './schedule';

export {
  computeNextSendDates,
  isScheduleDueAt,
  normalizeSchedule,
  notificationSlotKey,
  zonedLocalToUtc,
} from './schedule';

@Injectable()
export class AccountService {
  constructor(
    @InjectModel(ACCOUNT_MODEL) private readonly accounts: Model<Account>,
  ) {}

  async getSettings(accountId: string) {
    const account = await this.accounts.findById(accountId);
    if (!account) {
      throw new NotFoundException('Account not found.');
    }

    const language = normalizeLanguage(account.language);
    const emailSchedule = normalizeSchedule(account.emailNotificationSchedule);

    return {
      email: account.email,
      language,
      languages: ['es', 'en'] as AppLanguage[],
      emailSchedule,
      nextSendDates: computeNextSendDates(emailSchedule),
    };
  }

  async updateSettings(
    accountId: string,
    dto: UpdateAccountSettingsDto | UpdateEmailScheduleDto,
  ) {
    const account = await this.accounts.findById(accountId);
    if (!account) {
      throw new NotFoundException('Account not found.');
    }

    const current = normalizeSchedule(account.emailNotificationSchedule);
    const schedule = normalizeSchedule({
      enabled: dto.enabled ?? current.enabled,
      frequency: dto.frequency ?? current.frequency,
      daysOfWeek: dto.daysOfWeek ?? current.daysOfWeek,
      dayOfMonth: dto.dayOfMonth ?? current.dayOfMonth,
      sendTime: dto.sendTime ?? current.sendTime,
      timezone: dto.timezone ?? current.timezone,
    });

    const language = dto.language
      ? normalizeLanguage(dto.language)
      : normalizeLanguage(account.language, DEFAULT_LANGUAGE);

    const updated = await this.accounts.findByIdAndUpdate(
      new Types.ObjectId(accountId),
      {
        $set: {
          language,
          emailNotificationSchedule: schedule,
        },
      },
      { new: true },
    );

    if (!updated) {
      throw new NotFoundException('Account not found.');
    }

    return {
      email: updated.email,
      language,
      languages: ['es', 'en'] as AppLanguage[],
      emailSchedule: schedule,
      nextSendDates: computeNextSendDates(schedule),
    };
  }

  /** @deprecated Use updateSettings. */
  async updateSchedule(accountId: string, dto: UpdateEmailScheduleDto) {
    return this.updateSettings(accountId, dto);
  }
}
