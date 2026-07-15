import { getJwtSecret, getMongoUri, getPort, getRedisUrl } from './environment';

describe('environment validation', () => {
  it('uses the default port when PORT is unset', () => {
    expect(getPort({})).toBe(3000);
  });

  it('accepts a valid port', () => {
    expect(getPort({ PORT: '4000' })).toBe(4000);
  });

  it('rejects an invalid port', () => {
    expect(() => getPort({ PORT: '0' })).toThrow(
      'PORT must be an integer between 1 and 65535.',
    );
  });

  it('rejects a missing JWT secret', () => {
    expect(() => getJwtSecret({})).toThrow('JWT_SECRET must be configured.');
  });

  it('trims the JWT secret before it is used', () => {
    expect(getJwtSecret({ JWT_SECRET: ' secret ' })).toBe('secret');
  });

  it('validates MongoDB connection protocols', () => {
    expect(() => getMongoUri({ MONGO_URI: 'https://example.com' })).toThrow(
      'MongoDB connection URL must use the mongodb:// or mongodb+srv:// protocol.',
    );
  });

  it('does not enable Redis when REDIS_URL is unset', () => {
    expect(getRedisUrl({})).toBeUndefined();
  });

  it('validates Redis connection protocols', () => {
    expect(() => getRedisUrl({ REDIS_URL: 'https://example.com' })).toThrow(
      'REDIS_URL must use the redis:// or rediss:// protocol.',
    );
  });
});
