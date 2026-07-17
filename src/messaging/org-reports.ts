import type { StaffOrgReport, StaffOrgReportRole } from './messaging.schema';

const REPORT_ROLES: StaffOrgReportRole[] = ['operario', 'jornalero', 'otro'];

function asTrimmed(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

function isReportRole(value: unknown): value is StaffOrgReportRole {
  return (
    typeof value === 'string' &&
    REPORT_ROLES.includes(value as StaffOrgReportRole)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Normalize and validate org-chart report rows from DTO or stored docs. */
export function normalizeOrgReports(value: unknown): StaffOrgReport[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const reports: StaffOrgReport[] = [];
  for (const item of value) {
    if (!isRecord(item)) {
      continue;
    }
    const id = asTrimmed(item.id);
    const name = asTrimmed(item.name);
    if (!id || !name || !isReportRole(item.role)) {
      continue;
    }
    const roleOther =
      item.role === 'otro'
        ? (asTrimmed(item.roleOther) ?? undefined)
        : undefined;
    reports.push({
      id,
      name,
      role: item.role,
      ...(roleOther ? { roleOther } : {}),
    });
  }
  return reports;
}
