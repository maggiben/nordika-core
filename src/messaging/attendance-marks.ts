import type {
  StaffAttendanceMark,
  StaffAttendanceStatus,
} from './messaging.schema';

export const ATTENDANCE_STATUSES: StaffAttendanceStatus[] = [
  'full_day',
  'half_day',
  'absent',
  'justified',
];

function asTrimmed(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isAttendanceStatus(
  value: unknown,
): value is StaffAttendanceStatus {
  return (
    typeof value === 'string' &&
    ATTENDANCE_STATUSES.includes(value as StaffAttendanceStatus)
  );
}

export function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function isYearMonth(value: string): boolean {
  return /^\d{4}-\d{2}$/.test(value);
}

export function dateInYearMonth(date: string, yearMonth: string): boolean {
  return (
    isIsoDate(date) &&
    isYearMonth(yearMonth) &&
    date.startsWith(`${yearMonth}-`)
  );
}

/** Normalize attendance mark rows from DTO or stored docs. */
export function normalizeAttendanceMarks(
  value: unknown,
): StaffAttendanceMark[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const marks: StaffAttendanceMark[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!isRecord(item)) {
      continue;
    }
    const reportId = asTrimmed(item.reportId);
    const date = asTrimmed(item.date);
    if (
      !reportId ||
      !date ||
      !isIsoDate(date) ||
      !isAttendanceStatus(item.status)
    ) {
      continue;
    }
    const key = `${reportId}|${date}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    marks.push({ reportId, date, status: item.status });
  }
  return marks;
}

export function filterMarksByYearMonth(
  marks: StaffAttendanceMark[],
  yearMonth?: string,
): StaffAttendanceMark[] {
  if (!yearMonth || !isYearMonth(yearMonth)) {
    return marks;
  }
  return marks.filter((mark) => dateInYearMonth(mark.date, yearMonth));
}

/** Replace marks in yearMonth with nextMonthMarks; keep all other months. */
export function mergeAttendanceMonth(
  existing: StaffAttendanceMark[],
  yearMonth: string,
  nextMonthMarks: StaffAttendanceMark[],
): StaffAttendanceMark[] {
  const kept = existing.filter(
    (mark) => !dateInYearMonth(mark.date, yearMonth),
  );
  const normalized = normalizeAttendanceMarks(nextMonthMarks).filter((mark) =>
    dateInYearMonth(mark.date, yearMonth),
  );
  return [...kept, ...normalized];
}
