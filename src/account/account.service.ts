import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Account,
  ACCOUNT_MODEL,
  EmailNotificationSchedule,
} from '../auth/auth.schema';
import { UpdateEmailScheduleDto } from './account.dto';

const DEFAULT_SCHEDULE: EmailNotificationSchedule = {
  enabled: false,
  frequency: 'weekly',
  daysOfWeek: [1],
  dayOfMonth: 1,
  sendTime: '09:00',
  timezone: 'America/Argentina/Buenos_Aires',
};

export function normalizeSchedule(
  value?: EmailNotificationSchedule | null,
): EmailNotificationSchedule {
  if (!value) {
    return { ...DEFAULT_SCHEDULE };
  }

  return {
    enabled: Boolean(value.enabled),
    frequency: value.frequency === 'monthly' ? 'monthly' : 'weekly',
    daysOfWeek:
      Array.isArray(value.daysOfWeek) && value.daysOfWeek.length > 0
        ? value.daysOfWeek.filter(
            (day) => Number.isInteger(day) && day >= 0 && day <= 6,
          )
        : [1],
    dayOfMonth:
      typeof value.dayOfMonth === 'number' &&
      value.dayOfMonth >= 1 &&
      value.dayOfMonth <= 28
        ? value.dayOfMonth
        : 1,
    sendTime:
      typeof value.sendTime === 'string' &&
      /^([01]\d|2[0-3]):[0-5]\d$/.test(value.sendTime)
        ? value.sendTime
        : '09:00',
    timezone:
      typeof value.timezone === 'string' && value.timezone.length > 0
        ? value.timezone
        : DEFAULT_SCHEDULE.timezone,
  };
}

export function computeNextSendDates(
  schedule: EmailNotificationSchedule,
  count = 3,
  from = new Date(),
): string[] {
  if (!schedule.enabled) {
    return [];
  }

  const results: string[] = [];
  const start = new Date(from);
  start.setSeconds(0, 0);

  for (let offset = 0; offset < 366 && results.length < count; offset++) {
    const day = new Date(start);
    day.setDate(start.getDate() + offset);
    day.setHours(0, 0, 0, 0);

    const matches =
      schedule.frequency === 'weekly'
        ? schedule.daysOfWeek.includes(day.getDay())
        : day.getDate() === schedule.dayOfMonth;

    if (!matches) {
      continue;
    }

    const [hours, minutes] = schedule.sendTime.split(':').map(Number);
    const sendAt = new Date(day);
    sendAt.setHours(hours, minutes, 0, 0);

    if (sendAt > from) {
      results.push(sendAt.toISOString());
    }
  }

  return results;
}

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

    const emailSchedule = normalizeSchedule(account.emailNotificationSchedule);

    return {
      email: account.email,
      emailSchedule,
      nextSendDates: computeNextSendDates(emailSchedule),
    };
  }

  async updateSchedule(accountId: string, dto: UpdateEmailScheduleDto) {
    const schedule = normalizeSchedule({
      enabled: dto.enabled,
      frequency: dto.frequency,
      daysOfWeek: dto.daysOfWeek,
      dayOfMonth: dto.dayOfMonth,
      sendTime: dto.sendTime,
      timezone: dto.timezone ?? DEFAULT_SCHEDULE.timezone,
    });

    const account = await this.accounts.findByIdAndUpdate(
      new Types.ObjectId(accountId),
      { $set: { emailNotificationSchedule: schedule } },
      { new: true },
    );

    if (!account) {
      throw new NotFoundException('Account not found.');
    }

    return {
      email: account.email,
      emailSchedule: schedule,
      nextSendDates: computeNextSendDates(schedule),
    };
  }
}
