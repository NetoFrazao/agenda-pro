import {
  PIX_RECONCILE_LOCK_KEY,
  PUBLIC_PROFILE_CACHE_PREFIX,
  PUBLIC_SLOTS_CACHE_PREFIX,
  REDIS_CACHE_CIRCUIT_COOLDOWN_MS,
  RedisCacheService,
} from './redis-cache.service';

describe('RedisCacheService', () => {
  it('publicProfileKey usa prefixo estável', () => {
    const env = { redisUrl: 'redis://localhost:6379' };
    const svc = new RedisCacheService(env as never);
    expect(svc.publicProfileKey('studio-maria')).toBe(`${PUBLIC_PROFILE_CACHE_PREFIX}studio-maria`);
  });

  it('publicSlotsKey inclui slug/serviço/data/profissional', () => {
    const env = { redisUrl: 'redis://localhost:6379' };
    const svc = new RedisCacheService(env as never);
    expect(svc.publicSlotsKey('demo', 'svc1', '2026-08-10', 'pro1')).toBe(
      `${PUBLIC_SLOTS_CACHE_PREFIX}demo:svc1:2026-08-10:pro1`,
    );
    expect(svc.publicSlotsKey('demo', 'svc1', '2026-08-10')).toBe(
      `${PUBLIC_SLOTS_CACHE_PREFIX}demo:svc1:2026-08-10:_`,
    );
  });

  it('get/set/del degradam sem lançar quando circuito aberto', async () => {
    const env = { redisUrl: 'redis://127.0.0.1:1' };
    const svc = new RedisCacheService(env as never);
    (svc as unknown as { circuitOpenUntil: number }).circuitOpenUntil = Date.now() + 60_000;

    await expect(svc.getJson('k')).resolves.toBeNull();
    await expect(svc.setJson('k', { a: 1 }, 30)).resolves.toBeUndefined();
    await expect(svc.del('k')).resolves.toBeUndefined();
    await expect(svc.delByPrefix('cache:')).resolves.toBeUndefined();
    await expect(svc.invalidatePublicProfile('x')).resolves.toBeUndefined();
    await expect(svc.invalidatePublicSlots('x')).resolves.toBeUndefined();
    await expect(svc.tryAcquireLock(PIX_RECONCILE_LOCK_KEY, 55)).resolves.toBe('unavailable');
  });

  it('circuit breaker reabre após cooldown (permite nova tentativa)', () => {
    const env = { redisUrl: 'redis://localhost:6379' };
    const svc = new RedisCacheService(env as never);
    const state = svc as unknown as { circuitOpenUntil: number };
    state.circuitOpenUntil = Date.now() - 1;
    expect(svc.isCircuitOpen()).toBe(false);

    state.circuitOpenUntil = Date.now() + REDIS_CACHE_CIRCUIT_COOLDOWN_MS;
    expect(svc.isCircuitOpen()).toBe(true);
  });

  it('tryAcquireLock: acquired / busy via SET NX', async () => {
    const set = jest.fn().mockResolvedValueOnce('OK').mockResolvedValueOnce(null);
    const env = { redisUrl: 'redis://localhost:6379' };
    const svc = new RedisCacheService(env as never);
    (svc as unknown as { client: unknown; circuitOpenUntil: number }).client = { set };
    (svc as unknown as { circuitOpenUntil: number }).circuitOpenUntil = 0;
    // Bypass ensureClient connect — stub client already set; force ensure to return it
    jest.spyOn(svc as never, 'ensureClient' as never).mockResolvedValue({ set } as never);

    await expect(svc.tryAcquireLock(PIX_RECONCILE_LOCK_KEY, 55)).resolves.toBe('acquired');
    await expect(svc.tryAcquireLock(PIX_RECONCILE_LOCK_KEY, 55)).resolves.toBe('busy');
    expect(set).toHaveBeenCalledWith(PIX_RECONCILE_LOCK_KEY, '1', 'EX', 55, 'NX');
  });
});
