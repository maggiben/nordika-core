export type StaffResponseTrafficLight =
  'green' | 'yellow' | 'red' | 'pending' | 'neutral';

/** Reply within this many days → green. */
export const STAFF_GREEN_MAX_DAYS = 2;

/** Reply within this many days (after green) → yellow; beyond → red. */
export const STAFF_YELLOW_MAX_DAYS = 5;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Precise semaphore from latency milliseconds (AI-ready shared rule).
 */
export function responseStatusFromLatencyMs(
  latencyMs: number | null | undefined,
): StaffResponseTrafficLight {
  if (latencyMs === null || latencyMs === undefined || latencyMs < 0) {
    return 'pending';
  }
  const days = latencyMs / MS_PER_DAY;
  if (days <= STAFF_GREEN_MAX_DAYS) {
    return 'green';
  }
  if (days <= STAFF_YELLOW_MAX_DAYS) {
    return 'yellow';
  }
  return 'red';
}

export function responseStatusWhileWaiting(
  sentAt: Date,
  now: Date = new Date(),
): StaffResponseTrafficLight {
  const silentMs = now.getTime() - sentAt.getTime();
  if (silentMs < 0) {
    return 'pending';
  }
  return responseStatusFromLatencyMs(silentMs);
}

export function computeResponseLatencyMs(
  sentAt: Date,
  repliedAt: Date,
): number {
  return Math.max(0, repliedAt.getTime() - sentAt.getTime());
}
