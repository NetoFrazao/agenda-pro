# Variáveis de ambiente — Agenda Pro

Fonte canônica de exemplos: [`.env.example`](../.env.example).  
**Nunca** commit o arquivo `.env` com segredos reais.

## Infra local (Docker Compose)

| Variável | Descrição |
|----------|-----------|
| `POSTGRES_USER` / `PASSWORD` / `DB` / `PORT` | Credenciais do container Postgres |
| `REDIS_PORT` | Porta host do Redis (dev compose) |
| `REDIS_PASSWORD` | **Obrigatório** em `docker-compose.prod.yml` (`--requirepass`). Dev compose sem AUTH. Preferir hex (`openssl rand -hex 32`). |

## API

| Variável | Descrição |
|----------|-----------|
| `NODE_ENV` | `development` \| `test` \| `production` |
| `API_PORT` / `API_HOST` | Bind da API |
| `DATABASE_URL` | Prisma; use `connection_limit` no query string |
| `DATABASE_CONNECTION_LIMIT` | Documentação do pool (alinhar com URL) |
| `REDIS_URL` | BullMQ + cache; em prod compose: `redis://:${REDIS_PASSWORD}@redis:6379` |
| `PROCESS_ROLE` | `all` (default) \| `api` \| `worker` — ver [PERFORMANCE.md](./PERFORMANCE.md) |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | ≥ 32 chars em produção |
| `JWT_ACCESS_TTL` / `JWT_REFRESH_TTL` | Ex.: `15m`, `7d` |
| `CORS_ORIGIN` | Origem do Next (com credentials) |
| `APP_NAME` / `APP_PUBLIC_URL` / `API_PUBLIC_URL` | Links e e-mails |
| `LOG_LEVEL` | Pino |
| `SWAGGER_ENABLED` | Em prod, default off |

## Billing (Stripe)

| Variável | Descrição |
|----------|-----------|
| `STRIPE_SECRET_KEY` | Obrigatório em **produção** para upgrade pago |
| `STRIPE_WEBHOOK_SECRET` | Validação webhook |
| `STRIPE_PRICE_*` | Price IDs |
| `ALLOW_BILLING_DEMO` | Só fora de produção; ativa `local_demo` |
| `PLAN_*_PRICE_CENTS` | Preços exibidos / canônicos |

## Notificações

| Variável | Descrição |
|----------|-----------|
| `SMTP_*` / `EMAIL_FROM` | E-mail; vazio = log/no-op controlado |
| `EVOLUTION_API_*` | WhatsApp Evolution; vazio = `wa.me` |

## PIX (Mercado Pago)

| Variável | Descrição |
|----------|-----------|
| `MERCADOPAGO_ACCESS_TOKEN` | Cria cobranças PIX |
| `MERCADOPAGO_WEBHOOK_SECRET` | Assinatura do webhook (**obrigatório em prod** se PIX ativo) |

## Web (Next.js)

| Variável | Descrição |
|----------|-----------|
| `NEXT_PUBLIC_API_URL` | Base da API no browser |
| `NEXT_PUBLIC_APP_URL` | URL pública do app |

## Health

- `GET /api/health` — liveness (Postgres)
- `GET /api/health/ready` — readiness (Postgres **e** Redis); 503 se algum crítico down

## Ops / observabilidade

| Variável | Descrição |
|----------|-----------|
| `HEALTH_READY_URL` | URL do probe (`watch-ready` / GitHub Actions) |
| `HEALTH_ALERT_WEBHOOK_URL` | Slack/Discord/generic em falha de ready ou backup |
| `BACKUP_OFFHOST_DIR` | Destino off-host após `pg_dump` |
| `BACKUP_ALERT_WEBHOOK_URL` | Alerta específico de backup (fallback: health webhook) |
| `TLS_DOMAIN` / `CADDY_EMAIL` | Compose TLS (`docker-compose.tls.yml`) |
| `API_IMAGE` / `WEB_IMAGE` | Tags GHCR no deploy (`scripts/deploy-release.sh`) |
| `SENTRY_DSN` / `SENTRY_ENVIRONMENT` / `NEXT_PUBLIC_SENTRY_DSN` | Sentry SDK (fail-soft se vazio); ver [ops/SENTRY.md](./ops/SENTRY.md) |
| `SENTRY_AUTH_TOKEN` / `SENTRY_ORG` / `SENTRY_PROJECT` | Upload de source maps no build Web / CD (opcional) |
