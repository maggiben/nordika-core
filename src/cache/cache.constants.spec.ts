import {
  CACHE_TTLS,
  httpCacheKey,
  MESSAGING_CACHE_PATHS,
  SOURCES_CACHE_PATHS,
} from './cache.constants';

describe('cache.constants', () => {
  it('builds HTTP cache keys with a stable prefix', () => {
    expect(httpCacheKey('/messaging/contacts')).toBe(
      'http:/messaging/contacts',
    );
  });

  it('builds work-status and dispatch paths with optional ciclo filters', () => {
    expect(MESSAGING_CACHE_PATHS.workStatus()).toBe('/messaging/work-status');
    expect(MESSAGING_CACHE_PATHS.workStatus('abc')).toBe(
      '/messaging/work-status?cicloId=abc',
    );
    expect(MESSAGING_CACHE_PATHS.dispatches('abc')).toBe(
      '/messaging/dispatches?cicloId=abc',
    );
    expect(MESSAGING_CACHE_PATHS.progress()).toBe('/messaging/progress');
    expect(MESSAGING_CACHE_PATHS.progress('obra-1')).toBe(
      '/messaging/progress?projectId=obra-1',
    );
  });

  it('exposes cache TTL presets', () => {
    expect(CACHE_TTLS.ROOT_MS).toBeGreaterThan(CACHE_TTLS.MESSAGING_LIST_MS);
    expect(CACHE_TTLS.MESSAGING_LIST_MS).toBeGreaterThan(
      CACHE_TTLS.MESSAGING_DYNAMIC_MS,
    );
  });

  it('exposes sources list cache path', () => {
    expect(SOURCES_CACHE_PATHS.list).toBe('/sources');
  });
});
