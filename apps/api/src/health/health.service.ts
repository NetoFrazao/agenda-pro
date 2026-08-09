import { Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { EnvService } from '../config/env.service';
import { PrismaService } from '../prisma/prisma.service';

export type DependencyStatus = 'up' | 'down';

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly env: EnvService,
  ) {}

  /** Liveness: processo + Postgres (compatível com DEPLOY.md / load balancers atuais). */
  async check() {
    await this.prisma.$queryRaw`SELECT 1`;
    const redis = await this.pingRedis();

    return {
      status: 'ok' as const,
      service: 'agenda-pro-api',
      timestamp: new Date().toISOString(),
      database: 'up' as const,
      redis,
    };
  }

  /**
   * Readiness: Postgres obrigatório; Redis obrigatório para aceitar tráfego
   * (fila BullMQ / notificações). Retorna ready=false se qualquer um cair.
   */
  async ready() {
    let database: DependencyStatus = 'down';
    let redis: DependencyStatus = 'down';

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      database = 'up';
    } catch {
      database = 'down';
    }

    redis = await this.pingRedis();

    const ok = database === 'up' && redis === 'up';
    return {
      status: ok ? ('ok' as const) : ('degraded' as const),
      ready: ok,
      service: 'agenda-pro-api',
      timestamp: new Date().toISOString(),
      database,
      redis,
    };
  }

  private async pingRedis(): Promise<DependencyStatus> {
    const client = new Redis(this.env.redisUrl, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      connectTimeout: 2000,
      enableOfflineQueue: false,
    });

    try {
      await client.connect();
      const pong = await client.ping();
      return pong === 'PONG' ? 'up' : 'down';
    } catch {
      return 'down';
    } finally {
      client.disconnect();
    }
  }
}
