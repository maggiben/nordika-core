const MONGO_PROTOCOL_PATTERN = /^mongodb(?:\+srv)?:\/\//;

export interface MongoEnvironment {
  MONGO_URI?: string;
  MONGO_URL?: string;
}

export function getMongoUri(
  environment: MongoEnvironment = process.env,
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
