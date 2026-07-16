import {
  getAnthropicConfig,
  getAuthConfig,
  getEvolutionConfig,
  getJwtSecret,
  getMongoUri,
  getOpenAIConfig,
  getPort,
  getRedisUrl,
} from './environment';

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

  it('leaves Evolution disabled when all vars are omitted', () => {
    expect(getEvolutionConfig({})).toBeNull();
  });

  it('requires all Evolution vars together', () => {
    expect(() =>
      getEvolutionConfig({ EVOLUTION_API_URL: 'https://wa.example' }),
    ).toThrow(
      'EVOLUTION_API_URL, EVOLUTION_API_KEY, and EVOLUTION_INSTANCE must all be set together.',
    );
  });

  it('rejects invalid Evolution URLs', () => {
    expect(() =>
      getEvolutionConfig({
        EVOLUTION_API_URL: 'not-a-url',
        EVOLUTION_API_KEY: 'secret',
        EVOLUTION_INSTANCE: 'nodika',
      }),
    ).toThrow('EVOLUTION_API_URL must be a valid absolute URL.');

    expect(() =>
      getEvolutionConfig({
        EVOLUTION_API_URL: 'ftp://wa.example',
        EVOLUTION_API_KEY: 'secret',
        EVOLUTION_INSTANCE: 'nodika',
      }),
    ).toThrow('EVOLUTION_API_URL must be a valid absolute URL.');
  });

  it('accepts a complete Evolution configuration', () => {
    expect(
      getEvolutionConfig({
        EVOLUTION_API_URL: 'https://wa.example/',
        EVOLUTION_API_KEY: 'secret',
        EVOLUTION_INSTANCE: 'nodika',
      }),
    ).toEqual({
      apiKey: 'secret',
      baseUrl: 'https://wa.example',
      instance: 'nodika',
    });
  });

  it('requires and validates auth email delivery settings', () => {
    expect(() => getAuthConfig({})).toThrow(
      'APP_URL, RESEND_API_KEY, and RESEND_FROM must be configured for authentication.',
    );
    expect(
      getAuthConfig({
        APP_URL: 'https://app.example/',
        RESEND_API_KEY: 're_test',
        RESEND_FROM: 'Nodika <auth@example.com>',
      }),
    ).toMatchObject({
      appUrl: 'https://app.example',
      resendApiKey: 're_test',
      resendFrom: 'Nodika <auth@example.com>',
    });
  });

  it('leaves OpenAI disabled when the API key is unset', () => {
    expect(getOpenAIConfig({})).toBeNull();
    expect(getOpenAIConfig({ OPENAI_API_KEY: '   ' })).toBeNull();
  });

  it('defaults the OpenAI progress model when only the key is set', () => {
    expect(getOpenAIConfig({ OPENAI_API_KEY: ' sk-test ' })).toEqual({
      apiKey: 'sk-test',
      progressModel: 'gpt-4o-mini',
    });
    expect(
      getOpenAIConfig({
        OPENAI_API_KEY: 'sk-test',
        OPENAI_PROGRESS_MODEL: ' gpt-4o ',
      }),
    ).toEqual({
      apiKey: 'sk-test',
      progressModel: 'gpt-4o',
    });
  });

  it('leaves Anthropic disabled when the API key is unset', () => {
    expect(getAnthropicConfig({})).toBeNull();
    expect(getAnthropicConfig({ ANTHROPIC_API_KEY: '   ' })).toBeNull();
  });

  it('defaults the Anthropic progress model when only the key is set', () => {
    expect(getAnthropicConfig({ ANTHROPIC_API_KEY: ' sk-ant-test ' })).toEqual({
      apiKey: 'sk-ant-test',
      progressModel: 'claude-sonnet-4-5',
    });
    expect(
      getAnthropicConfig({
        ANTHROPIC_API_KEY: 'sk-ant-test',
        ANTHROPIC_PROGRESS_MODEL: ' claude-haiku-4-5 ',
      }),
    ).toEqual({
      apiKey: 'sk-ant-test',
      progressModel: 'claude-haiku-4-5',
    });
  });
});
