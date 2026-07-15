import { RedisCacheModule } from './redis-cache.module';

describe('RedisCacheModule', () => {
  const originalRedisUrl = process.env.REDIS_URL;

  afterEach(() => {
    if (originalRedisUrl) {
      process.env.REDIS_URL = originalRedisUrl;
    } else {
      delete process.env.REDIS_URL;
    }
  });

  it('does not configure a cache when Redis is unavailable', () => {
    delete process.env.REDIS_URL;

    expect(RedisCacheModule.register()).toEqual({
      module: RedisCacheModule,
      global: true,
      providers: [expect.any(Function)],
      exports: [expect.any(Function)],
    });
  });

  it('configures a global cache when Redis is available', () => {
    process.env.REDIS_URL = 'redis://localhost:6379';

    expect(RedisCacheModule.register().imports).toHaveLength(1);
  });
});
