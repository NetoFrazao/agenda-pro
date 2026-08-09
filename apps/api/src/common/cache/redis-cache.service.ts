import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { EnvService } from '../../config/env.service';

/** Prefixo de chaves de cache de leitura curta (não fila BullMQ). */
export const PUBLIC_PROFILE_CACHE_PREFIX = 'cache:public:profile:';
export const PUBLIC_PROFILE_TTL_SECONDS = 60;

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

  /** Invalida perfil público por slug (no-op se Redis down). */
  async invalidatePublicProfile(slug: string): Promise<void> {
    await this.del(this.publicProfileKey(slug));
  }

  /** Resolve slug do tenant e invalida (útil em mutações autenticadas). */
  async invalidatePublicProfileByTenantId(
    tenantId: string,
    resolveSlug: (tenantId: string) => Promise<string | null>,
  ): Promise<void> {
    try {
      const slug = await resolveSlug(tenantId);
      if (slug) await this.invalidatePublicProfile(slug);
    } catch (err) {
      this.logger.warn(`cache invalidate by tenant failed (${(err as Error).message})`);
    }
  }
}
