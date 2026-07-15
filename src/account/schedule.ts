import type { EmailNotificationSchedule } from '../auth/auth.schema';

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

type ZonedDateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** JS weekday: 0 = Sunday … 6 = Saturday. */
  weekday: number;
};

const WEEKDAY_TO_JS: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function readZonedParts(date: Date, timeZone: string): ZonedDateParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';

  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')),
    minute: Number(get('minute')),
    second: Number(get('second')),
    weekday: WEEKDAY_TO_JS[get('weekday')] ?? 0,
  };
}

function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = readZonedParts(date, timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return asUtc - date.getTime();
}

/** Interpret a civil wall time in `timeZone` as a UTC Date. */
export function zonedLocalToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const offset = getTimeZoneOffsetMs(utcGuess, timeZone);
  let resolved = new Date(
    Date.UTC(year, month - 1, day, hour, minute, 0) - offset,
  );
  const offsetAgain = getTimeZoneOffsetMs(resolved, timeZone);
  if (offsetAgain !== offset) {
    resolved = new Date(
      Date.UTC(year, month - 1, day, hour, minute, 0) - offsetAgain,
    );
  }
  return resolved;
}

function addCalendarDays(
  year: number,
  month: number,
  day: number,
  offset: number,
): { year: number; month: number; day: number } {
  const utc = new Date(Date.UTC(year, month - 1, day + offset));
  return {
    year: utc.getUTCFullYear(),
    month: utc.getUTCMonth() + 1,
    day: utc.getUTCDate(),
  };
}

/** Monday 00:00 of the week that contains `parts` (business week). */
function startOfWeekMonday(
  parts: Pick<ZonedDateParts, 'year' | 'month' | 'day' | 'weekday'>,
): { year: number; month: number; day: number } {
  const daysFromMonday = (parts.weekday + 6) % 7;
  return addCalendarDays(parts.year, parts.month, parts.day, -daysFromMonday);
}

export function computeNextSendDates(
  schedule: EmailNotificationSchedule,
  count = 3,
  from = new Date(),
): string[] {
  if (!schedule.enabled) {
    return [];
  }

  const timeZone = schedule.timezone || DEFAULT_SCHEDULE.timezone;
  const nowParts = readZonedParts(from, timeZone);
  const weekStart = startOfWeekMonday(nowParts);
  const weekEnd = addCalendarDays(
    weekStart.year,
    weekStart.month,
    weekStart.day,
    7,
  );
  const weekStartUtc = zonedLocalToUtc(
    weekStart.year,
    weekStart.month,
    weekStart.day,
    0,
    0,
    timeZone,
  );
  const weekEndUtc = zonedLocalToUtc(
    weekEnd.year,
    weekEnd.month,
    weekEnd.day,
    0,
    0,
    timeZone,
  );

  const [hours, minutes] = schedule.sendTime.split(':').map(Number);
  const results: string[] = [];

  // Scan from the Monday of the current week so "esta semana" stays visible
  // even when today's slot has already passed.
  for (let offset = 0; offset < 400 && results.length < count; offset++) {
    const calendar = addCalendarDays(
      weekStart.year,
      weekStart.month,
      weekStart.day,
      offset,
    );
    const sendAt = zonedLocalToUtc(
      calendar.year,
      calendar.month,
      calendar.day,
      hours,
      minutes,
      timeZone,
    );
    const weekday = readZonedParts(sendAt, timeZone).weekday;

    const matches =
      schedule.frequency === 'weekly'
        ? schedule.daysOfWeek.includes(weekday)
        : calendar.day === schedule.dayOfMonth;

    if (!matches) {
      continue;
    }

    const inCurrentWeek =
      sendAt.getTime() >= weekStartUtc.getTime() &&
      sendAt.getTime() < weekEndUtc.getTime();

    if (sendAt > from || inCurrentWeek) {
      results.push(sendAt.toISOString());
    }
  }

  return results;
}

/** True when `from` falls in the exact local minute configured for the schedule. */
export function isScheduleDueAt(
  schedule: EmailNotificationSchedule,
  from = new Date(),
): boolean {
  if (!schedule.enabled) {
    return false;
  }

  const timeZone = schedule.timezone || DEFAULT_SCHEDULE.timezone;
  const parts = readZonedParts(from, timeZone);
  const [hours, minutes] = schedule.sendTime.split(':').map(Number);

  if (parts.hour !== hours || parts.minute !== minutes) {
    return false;
  }

  if (schedule.frequency === 'weekly') {
    return schedule.daysOfWeek.includes(parts.weekday);
  }

  return parts.day === schedule.dayOfMonth;
}

/** Stable slot id used to claim a scheduled send at most once. */
export function notificationSlotKey(
  schedule: EmailNotificationSchedule,
  from = new Date(),
): string {
  const timeZone = schedule.timezone || DEFAULT_SCHEDULE.timezone;
  const parts = readZonedParts(from, timeZone);
  const date = `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
  return `${date}T${schedule.sendTime}|${timeZone}|${schedule.frequency}`;
}

/** UTC instant when the current notification slot begins (local send time on `from`'s date). */
export function catalogSlotStartsAt(
  schedule: EmailNotificationSchedule,
  from = new Date(),
): Date {
  const timeZone = schedule.timezone || DEFAULT_SCHEDULE.timezone;
  const parts = readZonedParts(from, timeZone);
  const [hours, minutes] = schedule.sendTime.split(':').map(Number);
  return zonedLocalToUtc(
    parts.year,
    parts.month,
    parts.day,
    hours,
    minutes,
    timeZone,
  );
}
