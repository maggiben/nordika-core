function asTrimmed(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids)];
}

/** Normalize contact membership from `projectIds` and legacy `projectId`. */
export function normalizeContactProjectIds(contact: {
  projectId?: string | null;
  projectIds?: string[] | null;
}): string[] {
  const fromArray = Array.isArray(contact.projectIds)
    ? contact.projectIds
        .map((id) => asTrimmed(id))
        .filter((id): id is string => Boolean(id))
    : [];
  if (fromArray.length > 0) {
    return uniqueIds(fromArray);
  }
  const singular = asTrimmed(contact.projectId);
  return singular ? [singular] : [];
}

/** Merge one or more project id lists / singular ids. */
export function mergeContactProjectIds(
  ...parts: Array<string | string[] | null | undefined>
): string[] {
  const collected: string[] = [];
  for (const part of parts) {
    if (typeof part === 'string') {
      const id = asTrimmed(part);
      if (id) {
        collected.push(id);
      }
      continue;
    }
    if (Array.isArray(part)) {
      for (const item of part) {
        const id = asTrimmed(item);
        if (id) {
          collected.push(id);
        }
      }
    }
  }
  return uniqueIds(collected);
}

export function contactBelongsToAnyProject(
  contact: { projectId?: string | null; projectIds?: string[] | null },
  allowed: Set<string>,
): boolean {
  return normalizeContactProjectIds(contact).some((id) => allowed.has(id));
}
