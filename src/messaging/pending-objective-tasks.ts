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
 * Extract pending `tareas_con_objetivo` from a Nodika snapshot payload.
 * Caps the list to avoid flooding WhatsApp.
 */
export function extractPendingObjectiveTasks(
  content: unknown,
  cap = DEFAULT_CAP,
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
    if (!isPendingObjectiveAvance(record.avance_base)) {
      continue;
    }
    pending.push({
      taskId: asString(record.id) ?? `task-${index + 1}`,
      label: asString(record.label) ?? `Task ${index + 1}`,
      avanceBase: asNumber(record.avance_base),
    });
    if (pending.length >= cap) {
      break;
    }
  }
  return pending;
}
