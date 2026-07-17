export type PendingObjectiveTask = {
  taskId: string;
  label: string;
  avanceBase: number | null;
};

const DEFAULT_CAP = 20;

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
 * Caps the list to avoid flooding WhatsApp.
 * When `livePercentByTaskId` is provided, tasks with live percent >= 100 are
 * excluded even if snapshot `avance_base` is still below 100.
 */
export function extractPendingObjectiveTasks(
  content: unknown,
  cap = DEFAULT_CAP,
  livePercentByTaskId?: ReadonlyMap<string, number>,
): PendingObjectiveTask[] {
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
    const livePercent = livePercentByTaskId?.get(taskId);
    if (
      !isPendingObjectiveAvance(
        effectiveObjectiveAvance(record.avance_base, livePercent),
      )
    ) {
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
