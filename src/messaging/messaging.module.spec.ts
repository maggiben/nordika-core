import { MessagingModule } from './messaging.module';
import { EvolutionClient } from './evolution.client';

describe('MessagingModule', () => {
  const originalMongo = process.env.MONGO_URI;

  afterEach(() => {
    if (originalMongo === undefined) {
      delete process.env.MONGO_URI;
    } else {
      process.env.MONGO_URI = originalMongo;
    }
  });

  it('returns an empty module when Mongo is not configured', () => {
    delete process.env.MONGO_URI;
    delete process.env.MONGO_URL;
    const dynamic = MessagingModule.register();
    expect(dynamic.controllers).toBeUndefined();
    expect(dynamic.providers).toBeUndefined();
  });

  it('registers messaging providers when Mongo is configured', () => {
    process.env.MONGO_URI = 'mongodb://localhost:27017/nodika';
    const dynamic = MessagingModule.register();
    expect(dynamic.controllers?.length).toBe(1);
    expect(dynamic.providers?.length).toBeGreaterThan(0);

    const clientProvider = dynamic.providers?.find(
      (provider) =>
        typeof provider === 'object' &&
        provider !== null &&
        'provide' in provider &&
        provider.provide === EvolutionClient,
    ) as { useFactory?: () => unknown } | undefined;
    expect(clientProvider?.useFactory?.()).toBeInstanceOf(EvolutionClient);
  });
});
