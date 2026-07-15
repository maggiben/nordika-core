import { CallHandler, ExecutionContext } from '@nestjs/common';
import { HttpAdapterHost, Reflector } from '@nestjs/core';
import { lastValueFrom, of } from 'rxjs';
import { HttpCacheInterceptor } from './http-cache.interceptor';

describe('HttpCacheInterceptor', () => {
  const reflector = new Reflector();
  const httpAdapter = {
    getRequestMethod: jest.fn(() => 'GET'),
    getRequestUrl: jest.fn(() => '/messaging/contacts'),
  };
  const httpAdapterHost = {
    httpAdapter,
  } as unknown as HttpAdapterHost;

  function createContext(): ExecutionContext {
    return {
      getType: () => 'http',
      switchToHttp: () => ({
        getRequest: () => ({}),
      }),
      getHandler: () => jest.fn(),
    } as unknown as ExecutionContext;
  }

  it('bypasses caching when Redis is not configured', async () => {
    const interceptor = new HttpCacheInterceptor(
      undefined,
      reflector,
      httpAdapterHost,
    );
    const next: CallHandler = { handle: () => of(['fresh']) };

    await expect(
      lastValueFrom(await interceptor.intercept(createContext(), next)),
    ).resolves.toEqual(['fresh']);
  });

  it('returns cached GET responses when present', async () => {
    const cache = {
      get: jest.fn(() => Promise.resolve(['cached'])),
      set: jest.fn(() => Promise.resolve(undefined)),
    };
    const interceptor = new HttpCacheInterceptor(
      cache as never,
      reflector,
      httpAdapterHost,
    );
    const next: CallHandler = { handle: () => of(['fresh']) };

    await expect(
      lastValueFrom(await interceptor.intercept(createContext(), next)),
    ).resolves.toEqual(['cached']);
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('stores GET responses when cache misses', async () => {
    const cache = {
      get: jest.fn(() => Promise.resolve(undefined)),
      set: jest.fn(() => Promise.resolve(undefined)),
    };
    const interceptor = new HttpCacheInterceptor(
      cache as never,
      reflector,
      httpAdapterHost,
    );
    const next: CallHandler = { handle: () => of(['fresh']) };

    await expect(
      lastValueFrom(await interceptor.intercept(createContext(), next)),
    ).resolves.toEqual(['fresh']);
    expect(cache.set).toHaveBeenCalledWith(
      'http:/messaging/contacts',
      ['fresh'],
      60_000,
    );
  });

  it('does not cache non-GET requests', async () => {
    httpAdapter.getRequestMethod.mockReturnValueOnce('POST');
    const cache = {
      get: jest.fn(),
      set: jest.fn(),
    };
    const interceptor = new HttpCacheInterceptor(
      cache as never,
      reflector,
      httpAdapterHost,
    );
    const next: CallHandler = { handle: () => of({ ok: true }) };

    await expect(
      lastValueFrom(await interceptor.intercept(createContext(), next)),
    ).resolves.toEqual({ ok: true });
    expect(cache.get).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
  });
});
