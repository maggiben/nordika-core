import { DynamicModule, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { getMongoUri } from './mongo.config';

@Module({})
export class MongoModule {
  static register(): DynamicModule {
    const uri = getMongoUri();

    if (!uri) {
      return {
        module: MongoModule,
      };
    }

    return {
      module: MongoModule,
      imports: [
        MongooseModule.forRoot(uri, {
          retryAttempts: 3,
          retryDelay: 1_000,
          serverSelectionTimeoutMS: 5_000,
        }),
      ],
    };
  }
}
