import type {
  StaffAttendanceMark,
  StaffAttendanceStatus,
  StaffOrgReport,
} from './messaging.schema';

export const ATTENDANCE_CATALOG_TAG = 'attendance';

const STATUS_PATTERNS: Array<{
  status: StaffAttendanceStatus;
  patterns: RegExp[];
}> = [
  {
    status: 'full_day',
    patterns: [
      /\bdia\s+completo\b/i,
      /\bfull\s*day\b/i,
      /\bpresente\b/i,
      /\bcompleto\b/i,
    ],
  },
  {
    status: 'half_day',
    patterns: [/\bmedia\s+jornada\b/i, /\bhalf\s*day\b/i, /\bmedia\b/i],
  },
  {
    status: 'absent',
    patterns: [/\bfalto\b/i, /\bausente\b/i, /\babsent\b/i, /\bno\s+vino\b/i],
  },
  {
    status: 'justified',
    patterns: [/\bjustificada?\b/i, /\blicencia\b/i, /\bjustified\b/i],
  },
];

function normalizeForMatch(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
}

function detectStatus(fragment: string): StaffAttendanceStatus | null {
  const normalized = normalizeForMatch(fragment);
  for (const entry of STATUS_PATTERNS) {
    if (entry.patterns.some((pattern) => pattern.test(normalized))) {
      return entry.status;
    }
  }
  return null;
}

export function isAttendanceCatalogMessage(input: {
  tags?: string[] | null;
  title?: string | null;
  body?: string | null;
}): boolean {
  const tags = (input.tags ?? [])
    .map((tag) => (typeof tag === 'string' ? tag.trim().toLowerCase() : ''))
    .filter(Boolean);
  if (tags.includes(ATTENDANCE_CATALOG_TAG)) {
    return true;
  }
  const haystack = `${input.title ?? ''}\n${input.body ?? ''}`.toLowerCase();
  return (
    haystack.includes('asistencia del equipo') ||
    haystack.includes('team attendance') ||
    haystack.includes('asistencia de hoy') ||
    haystack.includes("today's attendance") ||
    haystack.includes('todays attendance')
  );
}

function reportNameMatchers(report: StaffOrgReport): string[] {
  const full = normalizeForMatch(report.name);
  if (!full) {
    return [];
  }
  const matchers = [full];
  const first = full.split(/\s+/)[0];
  if (first && first.length >= 3 && first !== full) {
    matchers.push(first);
  }
  return matchers;
}

function textIncludesName(haystackNorm: string, matchers: string[]): boolean {
  return matchers.some((matcher) => {
    if (!matcher) {
      return false;
    }
    // Word-boundary style match for short first names.
    const escaped = matcher.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`).test(
      haystackNorm,
    );
  });
}

function statusWindowAroundName(
  text: string,
  textNorm: string,
  matchers: string[],
  otherMatchers: string[],
): string | null {
  let bestStart = -1;
  let bestLen = 0;
  for (const matcher of matchers) {
    const start = textNorm.indexOf(matcher);
    if (start >= 0 && matcher.length >= bestLen) {
      bestStart = start;
      bestLen = matcher.length;
    }
  }
  if (bestStart < 0) {
    return null;
  }

  let end = textNorm.length;
  for (const other of otherMatchers) {
    if (!other || other.length < 3) {
      continue;
    }
    const next = textNorm.indexOf(other, bestStart + bestLen);
    if (next >= 0 && next < end) {
      end = next;
    }
  }

  // Approx map normalized offsets back to original (accent stripping shortens).
  const approxStart = Math.min(bestStart, text.length);
  const approxEnd = Math.min(
    text.length,
    Math.max(approxStart + 1, end + (text.length - textNorm.length)),
  );
  return text.slice(approxStart, approxEnd);
}

/**
 * Extract attendance marks from a jefe reply using org-chart report names.
 * Date is supplied by the caller (typically the reply calendar day).
 */
export function parseAttendanceReply(input: {
  replyBody: string;
  reports: StaffOrgReport[];
  date: string;
}): StaffAttendanceMark[] {
  const reply = input.replyBody?.trim() ?? '';
  if (
    !reply ||
    input.reports.length === 0 ||
    !/^\d{4}-\d{2}-\d{2}$/.test(input.date)
  ) {
    return [];
  }

  const lines = reply
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const marks: StaffAttendanceMark[] = [];
  const seen = new Set<string>();

  const reports = [...input.reports].sort(
    (a, b) => b.name.trim().length - a.name.trim().length,
  );

  const firstNameCounts = new Map<string, number>();
  for (const report of reports) {
    const first = normalizeForMatch(report.name).split(/\s+/)[0];
    if (!first) {
      continue;
    }
    firstNameCounts.set(first, (firstNameCounts.get(first) ?? 0) + 1);
  }

  const matcherByReport = new Map<string, string[]>();
  for (const report of reports) {
    const matchers = reportNameMatchers(report).filter((matcher) => {
      if (matcher.includes(' ')) {
        return true;
      }
      return (firstNameCounts.get(matcher) ?? 0) <= 1;
    });
    matcherByReport.set(report.id, matchers);
  }

  for (const report of reports) {
    const matchers = matcherByReport.get(report.id) ?? [];
    if (matchers.length === 0) {
      continue;
    }
    const otherMatchers = reports
      .filter((candidate) => candidate.id !== report.id)
      .flatMap((candidate) => matcherByReport.get(candidate.id) ?? []);

    let matchedStatus: StaffAttendanceStatus | null = null;

    for (const line of lines) {
      const lineNorm = normalizeForMatch(line);
      if (!textIncludesName(lineNorm, matchers)) {
        continue;
      }
      const window =
        statusWindowAroundName(line, lineNorm, matchers, otherMatchers) ?? line;
      matchedStatus = detectStatus(window);
      if (matchedStatus) {
        break;
      }
    }

    if (!matchedStatus) {
      const replyNorm = normalizeForMatch(reply);
      if (textIncludesName(replyNorm, matchers)) {
        const window =
          statusWindowAroundName(reply, replyNorm, matchers, otherMatchers) ??
          reply;
        matchedStatus = detectStatus(window);
      }
    }

    if (!matchedStatus || seen.has(report.id)) {
      continue;
    }
    seen.add(report.id);
    marks.push({
      reportId: report.id,
      date: input.date,
      status: matchedStatus,
    });
  }

  return marks;
}

/** Upsert marks for the same date+reportId into an existing list. */
export function upsertAttendanceMarksForDate(
  existing: StaffAttendanceMark[],
  next: StaffAttendanceMark[],
): StaffAttendanceMark[] {
  if (next.length === 0) {
    return existing;
  }
  const dates = new Set(next.map((mark) => mark.date));
  const kept = existing.filter(
    (mark) =>
      !dates.has(mark.date) ||
      !next.some(
        (candidate) =>
          candidate.date === mark.date && candidate.reportId === mark.reportId,
      ),
  );
  return [...kept, ...next];
}
