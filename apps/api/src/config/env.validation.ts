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
