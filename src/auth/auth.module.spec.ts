import { AuthModule } from './auth.module';

describe('AuthModule', () => {
  const originalMongo = process.env.MONGO_URI;
  const originalMongoUrl = process.env.MONGO_URL;

  afterEach(() => {
    if (originalMongo === undefined) {
      delete process.env.MONGO_URI;
    } else {
      process.env.MONGO_URI = originalMongo;
    }
    if (originalMongoUrl === undefined) {
      delete process.env.MONGO_URL;
    } else {
      process.env.MONGO_URL = originalMongoUrl;
    }
  });

  it('is defined', () => {
    expect(new AuthModule()).toBeInstanceOf(AuthModule);
  });

  it('registers auth HTTP routes when Mongo is configured', () => {
    process.env.MONGO_URI = 'mongodb://localhost:27017/nodika';
    const dynamic = AuthModule.register();
    expect(dynamic.controllers?.length).toBe(1);
    expect(dynamic.providers?.length).toBeGreaterThan(0);
  });

  it('skips auth HTTP routes when Mongo is absent', () => {
    delete process.env.MONGO_URI;
    delete process.env.MONGO_URL;
    const dynamic = AuthModule.register();
    expect(dynamic.controllers).toBeUndefined();
  });
});
