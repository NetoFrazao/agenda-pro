import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { EnvService } from '../../config/env.service';

/** Prefixo de chaves de cache de leitura curta (não fila BullMQ). */
export const PUBLIC_PROFILE_CACHE_PREFIX = 'cache:public:profile:';
export const PUBLIC_PROFILE_TTL_SECONDS = 60;

/** Slots públicos — TTL baixo; booking sempre revalida com lock. */
export const PUBLIC_SLOTS_CACHE_PREFIX = 'cache:public:slots:';
export const PUBLIC_SLOTS_TTL_SECONDS = 20;

/**
 * Cache Redis opcional com degrade seguro: se Redis estiver down,
 * get/set/del viram no-op e a app segue pelo Postgres.
 */
@Injectable()
export class RedisCacheService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisCacheService.name);
  private client: Redis | null = null;
  private connectPromise: Promise<boolean> | null = null;
  private disabled = false;

  constructor(private readonly env: EnvService) {}

  async onModuleDestroy() {
    if (this.client) {
      try {
        await this.client.quit();
      } catch {
        this.client.disconnect();
      }
      this.client = null;
    }
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

  private async ensureClient(): Promise<Redis | null> {
    if (this.disabled) return null;
    if (this.client) return this.client;

    if (!this.connectPromise) {
      this.connectPromise = (async () => {
        try {
          const client = new Redis(this.env.redisUrl, {
            maxRetriesPerRequest: 1,
            lazyConnect: true,
            connectTimeout: 1500,
            enableOfflineQueue: false,
            retryStrategy: () => null,
          });
          client.on('error', () => {
            /* suppress noisy reconnect loops; degrade on next op */
          });
          await client.connect();
          this.client = client;
          return true;
        } catch (err) {
          this.disabled = true;
          this.client = null;
          this.logger.warn(
            `Redis cache indisponível (${(err as Error).message}). Degrade: sem cache.`,
          );
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

  async getJson<T>(key: string): Promise<T | null> {
    const client = await this.ensureClient();
    if (!client) return null;
    try {
      const raw = await client.get(key);
      if (!raw) return null;
      return JSON.parse(raw) as T;
    } catch (err) {
      this.disabled = true;
      this.logger.warn(`cache get failed (${(err as Error).message})`);
      return null;
    }
  }

  async setJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    const client = await this.ensureClient();
    if (!client) return;
    try {
      await client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (err) {
      this.disabled = true;
      this.logger.warn(`cache set failed (${(err as Error).message})`);
    }
  }

  async del(key: string): Promise<void> {
    const client = await this.ensureClient();
    if (!client) return;
    try {
      await client.del(key);
    } catch (err) {
      this.disabled = true;
      this.logger.warn(`cache del failed (${(err as Error).message})`);
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
      this.disabled = true;
      this.logger.warn(`cache delByPrefix failed (${(err as Error).message})`);
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
