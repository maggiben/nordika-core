const MONGO_PROTOCOL_PATTERN = /^mongodb(?:\+srv)?:\/\//;
const REDIS_PROTOCOL_PATTERN = /^rediss?:\/\//;

export interface Environment {
  APP_URL?: string;
  EVOLUTION_API_KEY?: string;
  EVOLUTION_API_URL?: string;
  EVOLUTION_INSTANCE?: string;
  JWT_SECRET?: string;
  MONGO_URI?: string;
  MONGO_URL?: string;
  PORT?: string;
  REDIS_URL?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM?: string;
  WHATSAPP_TIMEZONE?: string;
  WHATSAPP_WEEKLY_CRON?: string;
}

export interface EvolutionConfig {
  apiKey: string;
  baseUrl: string;
  instance: string;
}

export interface AuthConfig {
  actionTtlMs: number;
  appUrl: string;
  refreshTtlMs: number;
  resendApiKey: string;
  resendFrom: string;
}

export function getPort(environment: Environment = process.env): number {
  const value = environment.PORT;

  if (!value) {
    return 3000;
  }

  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }

  return port;
}

export function getMongoUri(
  environment: Environment = process.env,
): string | undefined {
  const uri = environment.MONGO_URI ?? environment.MONGO_URL;

  if (!uri) {
    return undefined;
  }

  if (!MONGO_PROTOCOL_PATTERN.test(uri)) {
    throw new Error(
      'MongoDB connection URL must use the mongodb:// or mongodb+srv:// protocol.',
    );
  }

  return uri;
}

export function getJwtSecret(environment: Environment = process.env): string {
  const secret = environment.JWT_SECRET?.trim();

  if (!secret) {
    throw new Error('JWT_SECRET must be configured.');
  }

  return secret;
}

export function getAuthConfig(environment: Environment = process.env): AuthConfig {
  const resendApiKey = environment.RESEND_API_KEY?.trim();
  const resendFrom = environment.RESEND_FROM?.trim();
  const appUrl = environment.APP_URL?.trim();
  if (!resendApiKey || !resendFrom || !appUrl) {
    throw new Error(
      'APP_URL, RESEND_API_KEY, and RESEND_FROM must be configured for authentication.',
    );
  }
  return {
    actionTtlMs: 60 * 60 * 1000,
    appUrl: appUrl.replace(/\/$/, ''),
    refreshTtlMs: 30 * 24 * 60 * 60 * 1000,
    resendApiKey,
    resendFrom,
  };
}

export function getRedisUrl(
  environment: Environment = process.env,
): string | undefined {
  const url = environment.REDIS_URL;

  if (!url) {
    return undefined;
  }

  if (!REDIS_PROTOCOL_PATTERN.test(url)) {
    throw new Error('REDIS_URL must use the redis:// or rediss:// protocol.');
  }

  return url;
}

export function getEvolutionConfig(
  environment: Environment = process.env,
): EvolutionConfig | null {
  const baseUrl = environment.EVOLUTION_API_URL?.trim();
  const apiKey = environment.EVOLUTION_API_KEY?.trim();
  const instance = environment.EVOLUTION_INSTANCE?.trim();

  if (!baseUrl && !apiKey && !instance) {
    return null;
  }

  if (!baseUrl || !apiKey || !instance) {
    throw new Error(
      'EVOLUTION_API_URL, EVOLUTION_API_KEY, and EVOLUTION_INSTANCE must all be set together.',
    );
  }

  try {
    const parsed = new URL(baseUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('EVOLUTION_API_URL must be a valid absolute URL.');
    }
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === 'EVOLUTION_API_URL must be a valid absolute URL.'
    ) {
      throw error;
    }
    throw new Error('EVOLUTION_API_URL must be a valid absolute URL.');
  }

  return {
    apiKey,
    baseUrl: baseUrl.replace(/\/$/, ''),
    instance,
  };
}
