import { getMongoUri } from './mongo.config';

describe('getMongoUri', () => {
  it('prefers MONGO_URI over Railway MONGO_URL', () => {
    expect(
      getMongoUri({
        MONGO_URI: 'mongodb://override.example/nodika',
        MONGO_URL: 'mongodb://railway.example/nodika',
      }),
    ).toBe('mongodb://override.example/nodika');
  });

  it('uses Railway MONGO_URL when no override exists', () => {
    expect(
      getMongoUri({
        MONGO_URL: 'mongodb://railway.example/nodika',
      }),
    ).toBe('mongodb://railway.example/nodika');
  });

  it('does not enable MongoDB when no connection URL is configured', () => {
    expect(getMongoUri({})).toBeUndefined();
  });

  it('rejects a non-MongoDB connection URL without echoing it', () => {
    expect(() =>
      getMongoUri({
        MONGO_URL: 'https://example.com/not-mongodb',
      }),
    ).toThrow(
      'MongoDB connection URL must use the mongodb:// or mongodb+srv:// protocol.',
    );
  });
});
