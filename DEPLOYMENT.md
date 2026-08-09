# Deployment — Agenda Pro

Complementa `docs/DEPLOY.md` com checklist operacional pós-hardening infra.
Scorecard atual: `SCORECARD_DEVOPS.md`.

## Topologias

### A) Dev local (default)

- `docker compose up -d` → Postgres + Redis (**sem** Redis AUTH; porta no host)
- API/Web no host: `npm run dev:api` / `npm run dev:web`
- Bootstrap: `scripts/bootstrap-local.ps1`

### B) Compose produção-like

**Obrigatório no `.env`** (compose falha no parse se faltar — sem defaults fracos):

| Variável | Nota |
|----------|------|
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Sem fallback `agenda_secret` |
| `REDIS_PASSWORD` | `openssl rand -hex 32` (URL-safe); Redis sobe com `--requirepass` |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | ≥ 32 chars aleatórios |
| `CORS_ORIGIN` / `APP_PUBLIC_URL` / `API_PUBLIC_URL` | URLs reais |
| `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_APP_URL` | Build args do Web |

```bash
# Preencha .env (JWT, Postgres, REDIS_PASSWORD, CORS, URLs públicas)
docker compose -f docker-compose.prod.yml --env-file .env config   # sanity
docker compose -f docker-compose.prod.yml --env-file .env up -d --build
# Migrate uma vez (host ou one-shot) — script na raiz:
npm run db:migrate
```

A API recebe `REDIS_URL=redis://:${REDIS_PASSWORD}@redis:6379` (senha via compose).
Compose sobe **api** (`PROCESS_ROLE=api`) + **worker** (mesma imagem, BullMQ/PIX) + **web**.
Imagens: `apps/api/Dockerfile`, `apps/web/Dockerfile` (non-root, healthcheck, multi-stage).

### C) Cloud (Vercel web + Railway/Render API)

Ver `docs/DEPLOY.md`. Release command API: `prisma migrate deploy` via `npm run db:migrate` (raiz).

## Checklist pré-produção

- [ ] `NODE_ENV=production`
- [ ] `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` ≥ 32 chars aleatórios
- [ ] `REDIS_PASSWORD` forte se usar compose prod (ou Redis managed com AUTH)
- [ ] `CORS_ORIGIN` = origem real do front (HTTPS)
- [ ] `APP_PUBLIC_URL` / `API_PUBLIC_URL` / `NEXT_PUBLIC_*` coerentes
- [ ] `ALLOW_BILLING_DEMO=false` (ignorado em prod pelo app, mas manter false)
- [ ] Stripe keys **ou** upgrades pagos desabilitados conscientemente
- [ ] MP: `MERCADOPAGO_ACCESS_TOKEN` + `MERCADOPAGO_WEBHOOK_SECRET` se PIX ativo
- [ ] Redis persistente (AOF/volume ou managed) **com AUTH**
- [ ] `DATABASE_URL` com `connection_limit` adequado
- [ ] Cookies Secure no front/API (HTTPS)
- [ ] TLS / reverse proxy na frente de `:3000`/`:3001` (compose ainda publica HTTP)
- [ ] `GET /api/health` → 200; `GET /api/health/ready` → 200
- [ ] Backup testado (`BACKUP.md`) + opcional `scripts/watch-ready.ps1`
- [ ] Swagger off em prod (`SWAGGER_ENABLED=false`) salvo necessidade

## Health

| Endpoint | Uso |
|----------|-----|
| `GET /api/health` | Liveness — PG up; Redis informativo |
| `GET /api/health/ready` | Readiness — PG + Redis; **503** se algum down |

Compose prod e Docker HEALTHCHECK usam `/api/health/ready`.

## CI

`.github/workflows/ci.yml`:

- format, lint, unit, e2e, Prisma validate + migrate
- build API + build Web (`next build`)
- **docker build API** e **docker build Web** (jobs paralelos após lint-and-test)
- `npm audit --audit-level=high` com **soft-fail documentado**: highs atuais exigem `next@16` (postcss/sharp) ou bump coordenado de `@nestjs/swagger`→`js-yaml`; gate duro quebraria o pipeline sem upgrade planejado

Sem CD (registry push / deploy automático) neste repo.

## Observabilidade (plano — não instalado full stack)

1. Manter Pino + redação PII (já existe).
2. Alertas em ready=503 (`scripts/watch-ready.ps1` + webhook) e taxa 5xx (provedor/UptimeRobot).
3. Quando houver tenants reais: Sentry (API+Web) + OpenTelemetry traces amostrados.
