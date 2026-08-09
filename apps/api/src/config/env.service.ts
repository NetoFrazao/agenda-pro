import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvVars } from './env.validation';

@Injectable()
export class EnvService {
  constructor(private readonly config: ConfigService<EnvVars, true>) {}

  get nodeEnv() {
    return this.config.get('NODE_ENV', { infer: true });
  }

  get apiPort() {
    return this.config.get('API_PORT', { infer: true });
  }

  get apiHost() {
    return this.config.get('API_HOST', { infer: true });
  }

  get databaseUrl() {
    return this.config.get('DATABASE_URL', { infer: true });
  }

  get redisUrl() {
    return this.config.get('REDIS_URL', { infer: true });
  }

  get corsOrigin() {
    return this.config.get('CORS_ORIGIN', { infer: true });
  }

  get jwtAccessSecret() {
    return this.config.get('JWT_ACCESS_SECRET', { infer: true });
  }

  get jwtRefreshSecret() {
    return this.config.get('JWT_REFRESH_SECRET', { infer: true });
  }

  /** Preços placeholder por plano (centavos). Não hardcodar no código de domínio. */
  get planPricesCents() {
    return {
      STARTER: this.config.get('PLAN_STARTER_PRICE_CENTS', { infer: true }),
      PRO: this.config.get('PLAN_PRO_PRICE_CENTS', { infer: true }),
      BUSINESS: this.config.get('PLAN_BUSINESS_PRICE_CENTS', { infer: true }),
    } as const;
  }
}
