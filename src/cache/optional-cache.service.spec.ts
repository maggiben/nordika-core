import { OptionalCacheService } from './optional-cache.service';

describe('OptionalCacheService', () => {
  it('reports disabled when no cache manager is configured', () => {
    expect(new OptionalCacheService().isEnabled()).toBe(false);
  });

  it('deletes unique HTTP cache keys for the given paths', async () => {
    const del = jest.fn(() => Promise.resolve(undefined));
    const service = new OptionalCacheService({ del } as never);

    await service.invalidatePaths([
      '/messaging/contacts',
      '/messaging/contacts',
      '/messaging/templates',
    ]);

    expect(del).toHaveBeenCalledTimes(2);
    expect(del).toHaveBeenCalledWith('http:/messaging/contacts');
    expect(del).toHaveBeenCalledWith('http:/messaging/templates');
    expect(service.isEnabled()).toBe(true);
  });

  it('no-ops invalidatePaths when Redis is unavailable', async () => {
    const service = new OptionalCacheService();
    await expect(
      service.invalidatePaths(['/messaging/contacts']),
    ).resolves.toBeUndefined();
  });
});
