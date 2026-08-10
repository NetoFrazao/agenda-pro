# Deploy — Agenda Pro (Fase 6)

> **Atualizado:** checklist operacional, TLS Caddy, CD/GHCR e health em [`DEPLOYMENT.md`](../DEPLOYMENT.md).  
> Variáveis: [`ENV.md`](./ENV.md) · Índice: [`DOCUMENTATION.md`](./DOCUMENTATION.md) · Scorecard: [`reviews/SCORECARD_DEVOPS.md`](./reviews/SCORECARD_DEVOPS.md).

## Visão geral

| Parte | Sugestão | Observação |
|-------|----------|------------|
| Web (Next.js) | **Vercel** *ou* Compose+Caddy | Root Directory: `apps/web` |
| API (NestJS) | **Railway/Render** *ou* Compose+GHCR | Root: monorepo; worker separado |
| PostgreSQL | Railway/Render plugin | Use `DATABASE_URL` |
| Redis | Railway/Upstash | Use `REDIS_URL` (+ AUTH em self-host) |
| Registry | **GHCR** via `.github/workflows/cd.yml` | `agenda-pro-api` / `agenda-pro-web` |

## Variáveis obrigatórias (API)

Copie de `.env.example`. Em produção gere segredos longos:

- `DATABASE_URL`, `REDIS_URL`
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` (≥ 32 chars)
- `CORS_ORIGIN` = URL do frontend (HTTPS)
- `APP_PUBLIC_URL`, `API_PUBLIC_URL`
- `PLAN_*_PRICE_CENTS` (placeholders até validar preço)
- Opcional: `STRIPE_*`, `SMTP_*`, `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` (`docs/ops/SENTRY.md`)

## CD self-host (recomendado para compose)

1. Configure GitHub Environment `production` + package write (GHCR).
2. Vars de build Web: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_APP_URL`.
3. Secrets de deploy (opcional): `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`, `DEPLOY_PATH`.
4. Tag `v*` ou push em `main` → imagens publicadas.
5. No servidor (clone + `.env`):

```bash
export API_IMAGE=ghcr.io/<owner>/agenda-pro-api:sha-…
export WEB_IMAGE=ghcr.io/<owner>/agenda-pro-web:sha-…
./scripts/deploy-release.sh          # pull + migrate deploy + up
./scripts/deploy-release.sh --dry-run
```

TLS: `COMPOSE_FILES=docker-compose.prod.yml:docker-compose.tls.yml`.

## Web (Vercel)

1. Importar o repo GitHub
2. Framework Preset: Next.js
3. Root Directory: `apps/web`
4. Env: `NEXT_PUBLIC_API_URL=https://sua-api…`

## API (Railway)

1. New Project → Deploy from GitHub
2. Add PostgreSQL + Redis
3. Build: `npm install && npx prisma generate --schema apps/api/prisma/schema.prisma && npm run build -w @agenda-pro/api`
4. Start API: `PROCESS_ROLE=api npm run start:prod -w @agenda-pro/api`
5. Start Worker: `PROCESS_ROLE=worker npm run start:worker -w @agenda-pro/api`
6. Release: `npm run db:migrate` (raiz)

## Checklist pós-deploy

- [ ] `GET /api/health` → ok
- [ ] `GET /api/health/ready` → 200
- [ ] Health probe Actions configurado
- [ ] Backup cron/Task + off-host
- [ ] Registrar profissional / smoke booking

## Nota

Credenciais cloud são suas — o repo deixa CD/GHCR e scripts prontos; SSH secrets e DNS/TLS são do operador.
