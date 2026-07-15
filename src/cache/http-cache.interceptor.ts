import { CACHE_MANAGER, CacheTTL } from '@nestjs/cache-manager';
import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  NestInterceptor,
  Optional,
} from '@nestjs/common';
import { HttpAdapterHost, Reflector } from '@nestjs/core';
import type { Cache } from 'cache-manager';
import type { Request } from 'express';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { CACHE_TTLS } from './cache.constants';

const CACHE_TTL_METADATA = 'cache_module:cache_ttl';

@Injectable()
export class HttpCacheInterceptor implements NestInterceptor {
  constructor(
    @Optional()
    @Inject(CACHE_MANAGER)
    private readonly cache: Cache | undefined,
    private readonly reflector: Reflector,
    private readonly httpAdapterHost: HttpAdapterHost,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    if (!this.cache || context.getType() !== 'http') {
      return next.handle();
    }

    const httpAdapter = this.httpAdapterHost.httpAdapter;
    const request = context.switchToHttp().getRequest<Request>();

    if (httpAdapter.getRequestMethod(request) !== 'GET') {
      return next.handle();
    }

    const key = this.trackBy(context);
    const ttl =
      this.reflector.get<number>(CACHE_TTL_METADATA, context.getHandler()) ??
      CACHE_TTLS.DEFAULT_MS;
    const cached = await this.cache.get(key);

    if (cached !== undefined && cached !== null) {
      return of(cached);
    }

    const cache = this.cache;
    return next.handle().pipe(
      tap((response) => {
        void cache.set(key, response, ttl);
      }),
    );
  }

  private trackBy(context: ExecutionContext): string {
    const request = context.switchToHttp().getRequest<Request>();
    const url = String(this.httpAdapterHost.httpAdapter.getRequestUrl(request));
    return `http:${url}`;
  }
}

export { CacheTTL };
