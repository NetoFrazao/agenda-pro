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

  get jwtAccessTtl() {
    return this.config.get('JWT_ACCESS_TTL', { infer: true });
  }

  get jwtRefreshTtl() {
    return this.config.get('JWT_REFRESH_TTL', { infer: true });
  }

  get appPublicUrl() {
    return this.config.get('APP_PUBLIC_URL', { infer: true });
  }

  get appName() {
    return this.config.get('APP_NAME', { infer: true });
  }

  get stripeSecretKey() {
    return this.config.get('STRIPE_SECRET_KEY', { infer: true });
  }

  /** Demo de billing sem Stripe — nunca efetivo em production (ver BillingService). */
  get allowBillingDemo() {
    return this.config.get('ALLOW_BILLING_DEMO', { infer: true });
  }

  get stripeWebhookSecret() {
    return this.config.get('STRIPE_WEBHOOK_SECRET', { infer: true });
  }

  get stripePriceIds() {
    return {
      STARTER: this.config.get('STRIPE_PRICE_STARTER', { infer: true }),
      PRO: this.config.get('STRIPE_PRICE_PRO', { infer: true }),
      BUSINESS: this.config.get('STRIPE_PRICE_BUSINESS', { infer: true }),
    } as const;
  }

  get emailFrom() {
    return this.config.get('EMAIL_FROM', { infer: true });
  }

  get smtp() {
    return {
      host: this.config.get('SMTP_HOST', { infer: true }),
      port: this.config.get('SMTP_PORT', { infer: true }),
      user: this.config.get('SMTP_USER', { infer: true }),
      pass: this.config.get('SMTP_PASS', { infer: true }),
    };
  }

  get swaggerEnabled() {
    return (
      this.nodeEnv !== 'production' ||
      this.config.get('SWAGGER_ENABLED', { infer: true }) === 'true'
    );
  }

  get evolution() {
    return {
      url: this.config.get('EVOLUTION_API_URL', { infer: true }),
      apiKey: this.config.get('EVOLUTION_API_KEY', { infer: true }),
      instance: this.config.get('EVOLUTION_INSTANCE', { infer: true }),
    };
  }

  get mercadoPagoAccessToken() {
    return this.config.get('MERCADOPAGO_ACCESS_TOKEN', { infer: true });
  }

  get mercadoPagoWebhookSecret() {
    return this.config.get('MERCADOPAGO_WEBHOOK_SECRET', { infer: true });
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
