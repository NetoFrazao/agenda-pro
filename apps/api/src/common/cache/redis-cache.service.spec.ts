import { PUBLIC_PROFILE_CACHE_PREFIX, RedisCacheService } from './redis-cache.service';

describe('RedisCacheService', () => {
  it('publicProfileKey usa prefixo estável', () => {
    const env = { redisUrl: 'redis://localhost:6379' };
    const svc = new RedisCacheService(env as never);
    expect(svc.publicProfileKey('studio-maria')).toBe(`${PUBLIC_PROFILE_CACHE_PREFIX}studio-maria`);
  });

  it('get/set/del degradam sem lançar quando Redis desabilitado', async () => {
    const env = { redisUrl: 'redis://127.0.0.1:1' };
    const svc = new RedisCacheService(env as never);
    (svc as unknown as { disabled: boolean }).disabled = true;

    await expect(svc.getJson('k')).resolves.toBeNull();
    await expect(svc.setJson('k', { a: 1 }, 30)).resolves.toBeUndefined();
    await expect(svc.del('k')).resolves.toBeUndefined();
    await expect(svc.invalidatePublicProfile('x')).resolves.toBeUndefined();
  });
});
