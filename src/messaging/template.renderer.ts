export interface TemplateVariables {
  percent: string;
  duration: string;
  avance: string;
  ciclo_inicio: string;
  ciclo_fin: string;
  week: string;
  ciclo_name: string;
  notes: string;
}

export function renderTemplateText(
  template: string,
  variables: TemplateVariables,
): string {
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_match, key: string) => {
    const value = variables[key as keyof TemplateVariables];
    return value ?? '';
  });
}

export function computeWeekNumber(
  cicloInicio: Date,
  asOf: Date = new Date(),
): number {
  const start = startOfUtcDay(cicloInicio).getTime();
  const current = startOfUtcDay(asOf).getTime();
  if (current < start) {
    return 0;
  }
  const dayMs = 24 * 60 * 60 * 1000;
  return Math.floor((current - start) / (7 * dayMs)) + 1;
}

export function isDateWithinCiclo(
  cicloInicio: Date,
  cicloFin: Date,
  asOf: Date = new Date(),
): boolean {
  const day = startOfUtcDay(asOf).getTime();
  return (
    day >= startOfUtcDay(cicloInicio).getTime() &&
    day <= startOfUtcDay(cicloFin).getTime()
  );
}

export function formatDateOnly(date: Date): string {
  return startOfUtcDay(date).toISOString().slice(0, 10);
}

function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}
