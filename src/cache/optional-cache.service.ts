import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable, Optional } from '@nestjs/common';
import type { Cache } from 'cache-manager';
import { httpCacheKey } from './cache.constants';

@Injectable()
export class OptionalCacheService {
  constructor(
    @Optional() @Inject(CACHE_MANAGER) private readonly cache?: Cache,
  ) {}

  isEnabled(): boolean {
    return this.cache !== undefined;
  }

  async invalidatePaths(paths: string[]): Promise<void> {
    if (!this.cache) {
      return;
    }

    const keys = [...new Set(paths.map((path) => httpCacheKey(path)))];
    await Promise.all(keys.map((key) => this.cache!.del(key)));
  }
}
