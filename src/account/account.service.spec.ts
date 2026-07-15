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

    expect(weekly).toEqual([
      '2026-07-15T09:00:00.000Z',
      '2026-07-22T09:00:00.000Z',
    ]);
    expect(monthly).toEqual(['2026-07-20T10:00:00.000Z']);
    expect(disabled).toEqual([]);
  });

  it('keeps the current week visible after today’s slot has passed', () => {
    // Wednesday 15 Jul 2026 ~10:23 America/Argentina/Buenos_Aires
    const from = new Date('2026-07-15T13:23:00.000Z');
    const next = computeNextSendDates(
      {
        enabled: true,
        frequency: 'weekly',
        daysOfWeek: [3],
        dayOfMonth: 1,
        sendTime: '09:00',
        timezone: 'America/Argentina/Buenos_Aires',
      },
      3,
      from,
    );

    expect(next[0]).toBe('2026-07-15T12:00:00.000Z'); // Wed 09:00 BA this week
    expect(next[1]).toBe('2026-07-22T12:00:00.000Z');
    expect(next[2]).toBe('2026-07-29T12:00:00.000Z');
  });

  it('includes later days still left in the current week', () => {
    const from = new Date('2026-07-15T13:23:00.000Z');
    const next = computeNextSendDates(
      {
        enabled: true,
        frequency: 'weekly',
        daysOfWeek: [1, 4],
        dayOfMonth: 1,
        sendTime: '09:00',
        timezone: 'America/Argentina/Buenos_Aires',
      },
      3,
      from,
    );

    expect(next).toEqual([
      '2026-07-13T12:00:00.000Z', // Mon this week
      '2026-07-16T12:00:00.000Z', // Thu this week
      '2026-07-20T12:00:00.000Z', // Mon next week
    ]);
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

  it('returns settings including language for an existing account', async () => {
    accounts.findById.mockResolvedValue({
      email: 'person@example.com',
      language: 'en',
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
    expect(result.language).toBe('en');
    expect(result.languages).toEqual(['es', 'en']);
    expect(result.emailSchedule.enabled).toBe(true);
    expect(Array.isArray(result.nextSendDates)).toBe(true);
  });

  it('rejects missing accounts when reading settings', async () => {
    accounts.findById.mockResolvedValue(null);
    await expect(service.getSettings('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('updates language and notification schedule from the frontend', async () => {
    accounts.findById.mockResolvedValue({
      email: 'person@example.com',
      language: 'es',
      emailNotificationSchedule: {
        enabled: false,
        frequency: 'weekly',
        daysOfWeek: [1],
        dayOfMonth: 1,
        sendTime: '09:00',
        timezone: 'America/Argentina/Buenos_Aires',
      },
    });
    accounts.findByIdAndUpdate.mockResolvedValue({
      email: 'person@example.com',
      language: 'en',
    });

    const result = await service.updateSettings('507f1f77bcf86cd799439011', {
      language: 'en',
      enabled: true,
      frequency: 'monthly',
      daysOfWeek: [1],
      dayOfMonth: 15,
      sendTime: '11:00',
      timezone: 'UTC',
    });

    expect(result.language).toBe('en');
    expect(result.emailSchedule.frequency).toBe('monthly');
    expect(result.emailSchedule.dayOfMonth).toBe(15);
    expect(accounts.findByIdAndUpdate).toHaveBeenCalled();
  });

  it('rejects missing accounts when updating settings', async () => {
    accounts.findById.mockResolvedValue(null);
    await expect(
      service.updateSettings('507f1f77bcf86cd799439011', {
        language: 'es',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
