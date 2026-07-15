import { MongoModule } from './mongo.module';

describe('MongoModule', () => {
  const originalMongoUri = process.env.MONGO_URI;
  const originalMongoUrl = process.env.MONGO_URL;

  afterEach(() => {
    restoreEnvironment('MONGO_URI', originalMongoUri);
    restoreEnvironment('MONGO_URL', originalMongoUrl);
  });

  it('does not configure Mongoose without a MongoDB URL', () => {
    delete process.env.MONGO_URI;
    delete process.env.MONGO_URL;

    expect(MongoModule.register()).toEqual({ module: MongoModule });
  });

  it('configures Mongoose when a MongoDB URL is present', () => {
    process.env.MONGO_URI = 'mongodb://localhost/nodika-test';

    expect(MongoModule.register().imports).toHaveLength(1);
  });

  function restoreEnvironment(name: 'MONGO_URI' | 'MONGO_URL', value?: string) {
    if (value) {
      process.env[name] = value;
    } else {
      delete process.env[name];
    }
  }
});
