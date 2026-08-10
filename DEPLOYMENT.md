# Deployment — Agenda Pro

Complementa `docs/DEPLOY.md` com checklist operacional pós-hardening infra.
Scorecard: [`docs/reviews/SCORECARD_DEVOPS.md`](./docs/reviews/SCORECARD_DEVOPS.md).  
Migration `architecture_integrity`: diagnose + rollout em [`docs/DEPLOY.md`](./docs/DEPLOY.md) § *Rollout seguro* e [`docs/reviews/SCORECARD_MIGRATION_SAFETY.md`](./docs/reviews/SCORECARD_MIGRATION_SAFETY.md).

## Topologias

### A) Dev local (default)

- `docker compose up -d` → Postgres + Redis (**sem** Redis AUTH; porta no host)
- API/Web no host: `npm run dev:api` / `npm run dev:web`
- Bootstrap: `scripts/bootstrap-local.ps1`

### B) Compose produção-like (HTTP)

**Obrigatório no `.env`** (compose falha no parse se faltar — sem defaults fracos):

| Variável | Nota |
|----------|------|
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Sem fallback `agenda_secret` |
| `REDIS_PASSWORD` | `openssl rand -hex 32` (URL-safe); Redis sobe com `--requirepass` |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | ≥ 32 chars aleatórios |
| `CORS_ORIGIN` / `APP_PUBLIC_URL` / `API_PUBLIC_URL` | URLs reais |
| `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_APP_URL` | Build args do Web |

```bash
docker compose -f docker-compose.prod.yml --env-file .env config
docker compose -f docker-compose.prod.yml --env-file .env up -d --build
npm run db:migrate
```

Compose sobe **api** + **worker** + **web**. Imagens aceitam override `API_IMAGE` / `WEB_IMAGE` (GHCR).

### C) Compose + TLS (Caddy) — **breaking vs HTTP direto**

Remove publicação host de `:3000`/`:3001`. Tráfego só via Caddy `:80`/`:443`.

```bash
# .env: TLS_DOMAIN=app.example.com  CADDY_EMAIL=ops@example.com
# Ajuste CORS / APP_PUBLIC_URL / API_PUBLIC_URL / NEXT_PUBLIC_* para https://…
npm run docker:prod:tls:config
npm run docker:prod:tls:up
```

Caddyfile: `deploy/Caddyfile` (`/api/*` → api, resto → web). Certs locais opcionais em `deploy/certs/`.

Requer **Docker Compose ≥ 2.24** (`!reset` nos ports).

### D) Cloud (Vercel web + Railway/Render API)

Ver `docs/DEPLOY.md`. Release: `prisma migrate deploy` via `npm run db:migrate`.

### E) CD (GHCR)

Workflow [`.github/workflows/cd.yml`](./.github/workflows/cd.yml):

1. Buildx → push `ghcr.io/<owner>/agenda-pro-api|web:<tag>`
2. Deploy SSH opcional (`DEPLOY_HOST` / `DEPLOY_USER` / `DEPLOY_SSH_KEY` / `DEPLOY_PATH`)
3. No host: `scripts/deploy-release.sh` → pull → **`prisma migrate deploy`** → compose up

Sem secrets de deploy: imagens ainda são publicadas; deploy manual com o script.

## Checklist pré-produção

- [ ] `NODE_ENV=production`
- [ ] JWT / Redis / Postgres secrets fortes
- [ ] URLs HTTPS coerentes (`CORS_ORIGIN`, `*_PUBLIC_URL`, `NEXT_PUBLIC_*`)
- [ ] TLS via Caddy (topologia C) ou proxy externo
- [ ] `GET /api/health` + `/api/health/ready` = 200
- [ ] Backup agendado + `BACKUP_OFFHOST_DIR` + webhook de falha (`BACKUP.md`)
- [ ] Health probe Actions + `HEALTH_READY_URL` / `HEALTH_ALERT_WEBHOOK_URL`
- [ ] `SWAGGER_ENABLED=false`

## Health

| Endpoint | Uso |
|----------|-----|
| `GET /api/health` | Liveness — PG |
| `GET /api/health/ready` | Readiness — PG + Redis; **503** se down |

## CI / CD

| Workflow | Função |
|----------|--------|
| `ci.yml` | lint, test, e2e, build, docker build, **audit allowlist** (`ops/npm-audit-allowlist.json`) |
| `cd.yml` | build/push GHCR + deploy+migrate |
| `health-probe.yml` | cron 15 min → ready + webhook |
| `restore-drill.yml` | drill semanal com fixture |

Audit: `npm run ops:audit` — highs fora da allowlist ou allowlist expirada **quebram** CI (sem soft-fail).

## Observabilidade

1. Pino + redact (app).
2. Uptime: `watch-ready.ps1` + `health-probe.yml`.
3. Sentry: stub env + [`docs/ops/SENTRY.md`](./docs/ops/SENTRY.md) — SDK exige mudança em apps (fora deste escopo).
