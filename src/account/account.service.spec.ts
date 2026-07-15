import { NotFoundException } from '@nestjs/common';
import {
  AccountService,
  computeNextSendDates,
  normalizeSchedule,
} from './account.service';

describe('account schedule helpers', () => {
  it('normalizes missing and invalid schedule values', () => {
    expect(normalizeSchedule(null).enabled).toBe(false);
    expect(
      normalizeSchedule({
        enabled: true,
        frequency: 'monthly',
        daysOfWeek: [9, 1],
        dayOfMonth: 40,
        sendTime: 'bad',
        timezone: '',
      }).frequency,
    ).toBe('monthly');
    expect(
      normalizeSchedule({
        enabled: true,
        frequency: 'weekly',
        daysOfWeek: [],
        dayOfMonth: 10,
        sendTime: '09:30',
        timezone: 'UTC',
      }),
    ).toEqual({
      enabled: true,
      frequency: 'weekly',
      daysOfWeek: [1],
      dayOfMonth: 10,
      sendTime: '09:30',
      timezone: 'UTC',
    });
  });

  it('computes upcoming weekly and monthly send dates', () => {
    const from = new Date('2026-07-15T08:00:00.000Z');
    const weekly = computeNextSendDates(
      {
        enabled: true,
        frequency: 'weekly',
        daysOfWeek: [3],
        dayOfMonth: 1,
        sendTime: '09:00',
        timezone: 'UTC',
      },
      2,
      from,
    );
    const monthly = computeNextSendDates(
      {
        enabled: true,
        frequency: 'monthly',
        daysOfWeek: [1],
        dayOfMonth: 20,
        sendTime: '10:00',
        timezone: 'UTC',
      },
      1,
      from,
    );
    const disabled = computeNextSendDates(
      {
        enabled: false,
        frequency: 'weekly',
        daysOfWeek: [1],
        dayOfMonth: 1,
        sendTime: '09:00',
        timezone: 'UTC',
      },
      3,
      from,
    );

    expect(weekly).toHaveLength(2);
    expect(monthly).toHaveLength(1);
    expect(disabled).toEqual([]);
  });
});

describe('AccountService', () => {
  const accounts = {
    findById: jest.fn(),
    findByIdAndUpdate: jest.fn(),
  };
  let service: AccountService;

  beforeEach(() => {
    accounts.findById.mockReset();
    accounts.findByIdAndUpdate.mockReset();
    service = new AccountService(accounts as never);
  });

  it('returns settings for an existing account', async () => {
    accounts.findById.mockResolvedValue({
      email: 'person@example.com',
      emailNotificationSchedule: {
        enabled: true,
        frequency: 'weekly',
        daysOfWeek: [1],
        dayOfMonth: 1,
        sendTime: '09:00',
        timezone: 'America/Argentina/Buenos_Aires',
      },
    });

    const result = await service.getSettings('507f1f77bcf86cd799439011');

    expect(result.email).toBe('person@example.com');
    expect(result.emailSchedule.enabled).toBe(true);
    expect(Array.isArray(result.nextSendDates)).toBe(true);
  });

  it('rejects missing accounts when reading settings', async () => {
    accounts.findById.mockResolvedValue(null);
    await expect(service.getSettings('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('updates the notification schedule', async () => {
    accounts.findByIdAndUpdate.mockResolvedValue({
      email: 'person@example.com',
    });

    const result = await service.updateSchedule('507f1f77bcf86cd799439011', {
      enabled: true,
      frequency: 'monthly',
      daysOfWeek: [1],
      dayOfMonth: 15,
      sendTime: '11:00',
      timezone: 'UTC',
    });

    expect(result.emailSchedule.frequency).toBe('monthly');
    expect(result.emailSchedule.dayOfMonth).toBe(15);
    expect(accounts.findByIdAndUpdate).toHaveBeenCalled();
  });

  it('rejects missing accounts when updating schedules', async () => {
    accounts.findByIdAndUpdate.mockResolvedValue(null);
    await expect(
      service.updateSchedule('507f1f77bcf86cd799439011', {
        enabled: false,
        frequency: 'weekly',
        daysOfWeek: [1],
        dayOfMonth: 1,
        sendTime: '09:00',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
