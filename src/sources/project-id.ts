function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

/** Prefer `meta.projectId` from a Nodika snapshot payload. */
export function projectIdFromSnapshotContent(content: unknown): string | null {
  if (!isRecord(content)) {
    return null;
  }
  const meta = isRecord(content.meta) ? content.meta : {};
  return asString(meta.projectId);
}
