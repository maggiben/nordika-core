import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Account, ACCOUNT_MODEL } from '../auth/auth.schema';
import {
  DEFAULT_LANGUAGE,
  normalizeLanguage,
  type AppLanguage,
} from '../i18n/languages';
import {
  ProgressAiSettingsDto,
  UpdateAccountSettingsDto,
  UpdateEmailScheduleDto,
} from './account.dto';
import {
  isAllowedProgressAiModel,
  normalizeProgressAi,
  toPublicProgressAi,
  type ProgressAiSettings,
} from './progress-ai';
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
    const progressAi = toPublicProgressAi(account.progressAi);

    return {
      email: account.email,
      language,
      languages: ['es', 'en'] as AppLanguage[],
      activeProjectId: account.activeProjectId ?? null,
      ...(progressAi ? { progressAi } : {}),
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

    const set: Record<string, unknown> = {
      language,
      emailNotificationSchedule: schedule,
    };
    const unset: Record<string, 1> = {};
    if ('activeProjectId' in dto && dto.activeProjectId !== undefined) {
      const next = dto.activeProjectId;
      if (next === null || next === '') {
        unset.activeProjectId = 1;
      } else {
        set.activeProjectId = next.trim();
      }
    }

    if ('progressAi' in dto && dto.progressAi !== undefined) {
      set.progressAi = this.mergeProgressAi(account.progressAi, dto.progressAi);
    }

    const update: Record<string, unknown> = { $set: set };
    if (Object.keys(unset).length > 0) {
      update.$unset = unset;
    }

    const updated = await this.accounts.findByIdAndUpdate(
      new Types.ObjectId(accountId),
      update,
      { new: true },
    );

    if (!updated) {
      throw new NotFoundException('Account not found.');
    }

    const progressAi = toPublicProgressAi(updated.progressAi);

    return {
      email: updated.email,
      language,
      languages: ['es', 'en'] as AppLanguage[],
      activeProjectId: updated.activeProjectId ?? null,
      ...(progressAi ? { progressAi } : {}),
      emailSchedule: schedule,
      nextSendDates: computeNextSendDates(schedule),
    };
  }

  /** @deprecated Use updateSettings. */
  async updateSchedule(accountId: string, dto: UpdateEmailScheduleDto) {
    return this.updateSettings(accountId, dto);
  }

  private mergeProgressAi(
    existing: Account['progressAi'],
    dto: ProgressAiSettingsDto,
  ): ProgressAiSettings {
    const provider = dto.provider;
    const model = dto.model.trim();
    if (!isAllowedProgressAiModel(provider, model)) {
      throw new BadRequestException(
        `Model "${model}" is not allowed for provider "${provider}".`,
      );
    }

    const current = normalizeProgressAi(existing);
    const next: ProgressAiSettings = { provider, model };

    if ('openaiApiKey' in dto) {
      if (dto.openaiApiKey === null) {
        // cleared
      } else if (
        typeof dto.openaiApiKey === 'string' &&
        dto.openaiApiKey.trim()
      ) {
        next.openaiApiKey = dto.openaiApiKey.trim();
      }
    } else if (current?.openaiApiKey) {
      next.openaiApiKey = current.openaiApiKey;
    }

    if ('anthropicApiKey' in dto) {
      if (dto.anthropicApiKey === null) {
        // cleared
      } else if (
        typeof dto.anthropicApiKey === 'string' &&
        dto.anthropicApiKey.trim()
      ) {
        next.anthropicApiKey = dto.anthropicApiKey.trim();
      }
    } else if (current?.anthropicApiKey) {
      next.anthropicApiKey = current.anthropicApiKey;
    }

    return next;
  }
}
