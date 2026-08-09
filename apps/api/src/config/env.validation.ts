import { z } from 'zod';

/**
 * Validação centralizada de env com Zod.
 * Falha cedo no boot se faltar variável crítica — melhor que erro misterioso em runtime.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(3001),
  API_HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  APP_NAME: z.string().default('Agenda Pro'),
  APP_PUBLIC_URL: z.string().url().default('http://localhost:3000'),
  API_PUBLIC_URL: z.string().url().default('http://localhost:3001'),
  LOG_LEVEL: z.string().default('info'),
  PLAN_STARTER_PRICE_CENTS: z.coerce.number().int().nonnegative().default(0),
  PLAN_PRO_PRICE_CENTS: z.coerce.number().int().nonnegative().default(4990),
  PLAN_BUSINESS_PRICE_CENTS: z.coerce.number().int().nonnegative().default(9990),
  STRIPE_SECRET_KEY: z.string().optional().default(''),
  STRIPE_WEBHOOK_SECRET: z.string().optional().default(''),
  STRIPE_PRICE_STARTER: z.string().optional().default(''),
  STRIPE_PRICE_PRO: z.string().optional().default(''),
  STRIPE_PRICE_BUSINESS: z.string().optional().default(''),
  SMTP_HOST: z.string().optional().default(''),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASS: z.string().optional().default(''),
  EMAIL_FROM: z.string().default('Agenda Pro <noreply@agendapro.local>'),
  /// Swagger fica sempre ligado fora de produção; em produção só com 'true'
  SWAGGER_ENABLED: z.enum(['true', 'false']).default('false'),
  /// WhatsApp via Evolution API (self-hosted). Vazio = modo link wa.me
  EVOLUTION_API_URL: z.string().optional().default(''),
  EVOLUTION_API_KEY: z.string().optional().default(''),
  EVOLUTION_INSTANCE: z.string().optional().default(''),
  /// PIX via Mercado Pago. Vazio = sinal vira "pagar no local"
  MERCADOPAGO_ACCESS_TOKEN: z.string().optional().default(''),
});

export type EnvVars = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): EnvVars {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment variables: ${details}`);
  }
  return parsed.data;
}
