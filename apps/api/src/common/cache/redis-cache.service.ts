import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { EnvService } from '../../config/env.service';

/** Prefixo de chaves de cache de leitura curta (não fila BullMQ). */
export const PUBLIC_PROFILE_CACHE_PREFIX = 'cache:public:profile:';
export const PUBLIC_PROFILE_TTL_SECONDS = 60;

/** Slots públicos — TTL baixo; booking sempre revalida com lock. */
export const PUBLIC_SLOTS_CACHE_PREFIX = 'cache:public:slots:';
export const PUBLIC_SLOTS_TTL_SECONDS = 20;

/** Lock Redis SET NX — reconcile PIX (multi-réplica worker). */
export const PIX_RECONCILE_LOCK_KEY = 'lock:pix:reconcile';

export type DistributedLockResult = 'acquired' | 'busy' | 'unavailable';

/** Cooldown após falha antes de tentar reconectar (circuit breaker). */
export const REDIS_CACHE_CIRCUIT_COOLDOWN_MS = 5_000;

/**
 * Cache Redis opcional com degrade seguro + circuit breaker:
 * após falha abre o circuito por cooldown e tenta reconectar depois —
 * não fica desabilitado até reiniciar o processo.
 */
@Injectable()
export class RedisCacheService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisCacheService.name);
  private client: Redis | null = null;
  private connectPromise: Promise<boolean> | null = null;
  /** Epoch ms até o qual o circuito permanece aberto (sem tentar Redis). */
  private circuitOpenUntil = 0;

  constructor(private readonly env: EnvService) {}

  async onModuleDestroy() {
    await this.disposeClient();
  }

  /** @internal testes / observabilidade */
  isCircuitOpen(now = Date.now()): boolean {
    return now < this.circuitOpenUntil;
  }

  publicProfileKey(slug: string): string {
    return `${PUBLIC_PROFILE_CACHE_PREFIX}${slug}`;
  }

  publicSlotsKey(
    slug: string,
    serviceId: string,
    dateKey: string,
    professionalId?: string,
  ): string {
    return `${PUBLIC_SLOTS_CACHE_PREFIX}${slug}:${serviceId}:${dateKey}:${professionalId ?? '_'}`;
  }

  private async disposeClient(): Promise<void> {
    if (!this.client) return;
    const c = this.client;
    this.client = null;
    try {
      await c.quit();
    } catch {
      try {
        c.disconnect();
      } catch {
        /* ignore */
      }
    }
  }

  private tripCircuit(reason: string): void {
    this.circuitOpenUntil = Date.now() + REDIS_CACHE_CIRCUIT_COOLDOWN_MS;
    void this.disposeClient();
    this.logger.warn(
      `Redis cache circuit open (${reason}). Retry em ~${REDIS_CACHE_CIRCUIT_COOLDOWN_MS}ms.`,
    );
  }

  private async ensureClient(): Promise<Redis | null> {
    if (this.isCircuitOpen()) return null;
    if (this.client) return this.client;

    if (!this.connectPromise) {
      this.connectPromise = (async () => {
        try {
          const client = new Redis(this.env.redisUrl, {
            maxRetriesPerRequest: 1,
            lazyConnect: true,
            connectTimeout: 1500,
            enableOfflineQueue: false,
            // Sem retry infinito no ioredis — o circuit breaker decide quando tentar de novo.
            retryStrategy: () => null,
          });
          client.on('error', () => {
            /* suppress noisy reconnect loops; degrade on next op */
          });
          await client.connect();
          this.client = client;
          this.circuitOpenUntil = 0;
          return true;
        } catch (err) {
          this.client = null;
          this.tripCircuit((err as Error).message);
          return false;
        } finally {
          this.connectPromise = null;
        }
      })();
    }

    const pending = this.connectPromise;
    if (pending) {
      const ok = await pending;
      return ok ? this.client : null;
    }
    return this.client;
  }

  /**
   * SET key NX EX ttl — lock distribuído.
   * - `acquired`: este processo é o líder até o TTL
   * - `busy`: outro holder
   * - `unavailable`: Redis down / circuito aberto (caller pode degradar)
   */
  async tryAcquireLock(key: string, ttlSeconds: number): Promise<DistributedLockResult> {
    const client = await this.ensureClient();
    if (!client) return 'unavailable';
    try {
      const result = await client.set(key, '1', 'EX', ttlSeconds, 'NX');
      return result === 'OK' ? 'acquired' : 'busy';
    } catch (err) {
      this.tripCircuit(`lock ${(err as Error).message}`);
      return 'unavailable';
    }
  }

  async getJson<T>(key: string): Promise<T | null> {
    const client = await this.ensureClient();
    if (!client) return null;
    try {
      const raw = await client.get(key);
      if (!raw) return null;
      return JSON.parse(raw) as T;
    } catch (err) {
      this.tripCircuit(`get ${(err as Error).message}`);
      return null;
    }
  }

  async setJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    const client = await this.ensureClient();
    if (!client) return;
    try {
      await client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (err) {
      this.tripCircuit(`set ${(err as Error).message}`);
    }
  }

  async del(key: string): Promise<void> {
    const client = await this.ensureClient();
    if (!client) return;
    try {
      await client.del(key);
    } catch (err) {
      this.tripCircuit(`del ${(err as Error).message}`);
    }
  }

  /** Apaga chaves por prefixo via SCAN (sem KEYS bloqueante). */
  async delByPrefix(prefix: string): Promise<void> {
    const client = await this.ensureClient();
    if (!client) return;
    try {
      let cursor = '0';
      do {
        const [next, keys] = await client.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 64);
        cursor = next;
        if (keys.length > 0) await client.del(...keys);
      } while (cursor !== '0');
    } catch (err) {
      this.tripCircuit(`delByPrefix ${(err as Error).message}`);
    }
  }

  /** Invalida perfil público por slug (no-op se Redis down). */
  async invalidatePublicProfile(slug: string): Promise<void> {
    await this.del(this.publicProfileKey(slug));
  }

  /** Invalida todos os slots cacheados do slug (book/cancel/availability). */
  async invalidatePublicSlots(slug: string): Promise<void> {
    await this.delByPrefix(`${PUBLIC_SLOTS_CACHE_PREFIX}${slug}:`);
  }

  /** Resolve slug do tenant e invalida perfil + slots. */
  async invalidatePublicProfileByTenantId(
    tenantId: string,
    resolveSlug: (tenantId: string) => Promise<string | null>,
  ): Promise<void> {
    try {
      const slug = await resolveSlug(tenantId);
      if (slug) {
        await this.invalidatePublicProfile(slug);
        await this.invalidatePublicSlots(slug);
      }
    } catch (err) {
      this.logger.warn(`cache invalidate by tenant failed (${(err as Error).message})`);
    }
  }

  async invalidatePublicSlotsByTenantId(
    tenantId: string,
    resolveSlug: (tenantId: string) => Promise<string | null>,
  ): Promise<void> {
    try {
      const slug = await resolveSlug(tenantId);
      if (slug) await this.invalidatePublicSlots(slug);
    } catch (err) {
      this.logger.warn(`cache slots invalidate by tenant failed (${(err as Error).message})`);
    }
  }
}
