import { CacheModule } from '@nestjs/cache-manager';
import { DynamicModule, Module } from '@nestjs/common';
import { createKeyv } from '@keyv/redis';
import { getRedisUrl } from '../config/environment';

@Module({})
export class RedisCacheModule {
  static register(): DynamicModule {
    const redisUrl = getRedisUrl();

    if (!redisUrl) {
      return {
        module: RedisCacheModule,
      };
    }

    return {
      module: RedisCacheModule,
      imports: [
        CacheModule.register({
          isGlobal: true,
          stores: [createKeyv(redisUrl)],
        }),
      ],
    };
  }
}
