import { CacheModule } from '@nestjs/cache-manager';
import { DynamicModule, Module } from '@nestjs/common';
import { createKeyv } from '@keyv/redis';
import { getRedisUrl } from '../config/environment';
import { OptionalCacheService } from './optional-cache.service';

@Module({})
export class RedisCacheModule {
  static register(): DynamicModule {
    const redisUrl = getRedisUrl();
    const base = {
      module: RedisCacheModule,
      global: true,
      providers: [OptionalCacheService],
      exports: [OptionalCacheService],
    };

    if (!redisUrl) {
      return base;
    }

    return {
      ...base,
      imports: [
        CacheModule.register({
          isGlobal: true,
          stores: [createKeyv(redisUrl)],
        }),
      ],
    };
  }
}
