export type PendingObjectiveTask = {
  taskId: string;
  label: string;
  avanceBase: number | null;
};

export const DEFAULT_PENDING_TASK_CAP = 20;

export type ExtractPendingObjectiveTasksOptions = {
  cap?: number;
  livePercentByTaskId?: ReadonlyMap<string, number>;
  /**
   * Civil date YYYY-MM-DD used for the planned `ini`/`fin` window.
   * Defaults to today's UTC calendar date when omitted.
   */
  today?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Parse snapshot `ini`/`fin` into YYYY-MM-DD, or null when unusable. */
export function parseTaskCalendarDate(value: unknown): string | null {
  const raw = asString(value);
  if (!raw) {
    return null;
  }
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(raw);
  if (!match) {
    return null;
  }
  const iso = match[1];
  const [year, month, day] = iso.split('-').map(Number);
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }
  return iso;
}

/**
 * Inclusive planned window: task is askable when today is between ini and fin.
 * Missing or invalid dates are out of window.
 */
export function isTaskInDateWindow(
  ini: unknown,
  fin: unknown,
  today: string,
): boolean {
  const start = parseTaskCalendarDate(ini);
  const end = parseTaskCalendarDate(fin);
  if (!start || !end) {
    return false;
  }
  return start <= today && today <= end;
}

function utcToday(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Pending when avance_base is missing or strictly less than 100. */
export function isPendingObjectiveAvance(avanceBase: unknown): boolean {
  const value = asNumber(avanceBase);
  if (value === null) {
    return true;
  }
  return value < 100;
}

/**
 * Effective avance for WhatsApp pending checks: prefer live parsed percent
 * when present so tasks already reported at 100% are not re-asked.
 */
export function effectiveObjectiveAvance(
  snapshotAvanceBase: unknown,
  livePercent: number | undefined,
): unknown {
  return livePercent !== undefined ? livePercent : snapshotAvanceBase;
}

/**
 * Extract pending `tareas_con_objetivo` from a Nodika snapshot payload.
 * Applies the planned date window first, then a safety cap.
 * When `livePercentByTaskId` is provided, tasks with live percent >= 100 are
 * excluded even if snapshot `avance_base` is still below 100.
 *
 * Second argument may be a cap number (legacy) or an options object.
 */
export function extractPendingObjectiveTasks(
  content: unknown,
  capOrOptions:
    number | ExtractPendingObjectiveTasksOptions = DEFAULT_PENDING_TASK_CAP,
  livePercentByTaskId?: ReadonlyMap<string, number>,
): PendingObjectiveTask[] {
  const options: ExtractPendingObjectiveTasksOptions =
    typeof capOrOptions === 'number'
      ? { cap: capOrOptions, livePercentByTaskId }
      : {
          ...capOrOptions,
          livePercentByTaskId:
            capOrOptions.livePercentByTaskId ?? livePercentByTaskId,
        };
  const cap = options.cap ?? DEFAULT_PENDING_TASK_CAP;
  const liveMap = options.livePercentByTaskId;
  const today = options.today?.trim() || utcToday();

  if (!isRecord(content)) {
    return [];
  }
  const raw = content.tareas_con_objetivo;
  if (!Array.isArray(raw)) {
    return [];
  }

  const pending: PendingObjectiveTask[] = [];
  for (let index = 0; index < raw.length; index += 1) {
    const row: unknown = raw[index];
    const record = isRecord(row) ? row : {};
    const taskId = asString(record.id) ?? `task-${index + 1}`;
    const livePercent = liveMap?.get(taskId);
    if (
      !isPendingObjectiveAvance(
        effectiveObjectiveAvance(record.avance_base, livePercent),
      )
    ) {
      continue;
    }
    if (!isTaskInDateWindow(record.ini, record.fin, today)) {
      continue;
    }
    pending.push({
      taskId,
      label: asString(record.label) ?? `Task ${index + 1}`,
      avanceBase:
        livePercent !== undefined ? livePercent : asNumber(record.avance_base),
    });
    if (pending.length >= cap) {
      break;
    }
  }
  return pending;
}
