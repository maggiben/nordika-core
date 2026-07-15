export const HTTP_CACHE_PREFIX = 'http:';

export const CACHE_TTLS = {
  ROOT_MS: 3_600_000,
  MESSAGING_LIST_MS: 300_000,
  MESSAGING_DYNAMIC_MS: 60_000,
  DEFAULT_MS: 60_000,
} as const;

export function httpCacheKey(path: string): string {
  return `${HTTP_CACHE_PREFIX}${path}`;
}

export const MESSAGING_CACHE_PATHS = {
  contacts: '/messaging/contacts',
  templates: '/messaging/templates',
  ciclos: '/messaging/ciclos',
  roster: '/messaging/roster',
  catalog: '/messaging/catalog',
  workStatus: (cicloId?: string) =>
    cicloId
      ? `/messaging/work-status?cicloId=${cicloId}`
      : '/messaging/work-status',
  dispatches: (cicloId?: string) =>
    cicloId
      ? `/messaging/dispatches?cicloId=${cicloId}`
      : '/messaging/dispatches',
} as const;
