export const SUPPORTED_LANGUAGES = ['es', 'en'] as const;

export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const DEFAULT_LANGUAGE: AppLanguage = 'es';

export function normalizeLanguage(
  value: string | undefined | null,
  fallback: AppLanguage = DEFAULT_LANGUAGE,
): AppLanguage {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 'es' || normalized === 'en') {
    return normalized;
  }
  return fallback;
}
