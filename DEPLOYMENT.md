# Deployment — Agenda Pro

Complementa `docs/DEPLOY.md` com checklist operacional pós-hardening infra.

## Topologias

### A) Dev local (default)

- `docker compose up -d` → Postgres + Redis
- API/Web no host: `npm run dev:api` / `npm run dev:web`
- Bootstrap: `scripts/bootstrap-local.ps1`

### B) Compose produção-like

```bash
# Preencha .env (JWT reais, CORS, URLs públicas)
docker compose -f docker-compose.prod.yml --env-file .env up -d --build
# Migrate uma vez (host ou one-shot):
DATABASE_URL=... npm run db:migrate -w @agenda-pro/api
```

Imagens: `apps/api/Dockerfile`, `apps/web/Dockerfile` (non-root, healthcheck, multi-stage).

### C) Cloud (Vercel web + Railway/Render API)

Ver `docs/DEPLOY.md`. Release command API: `prisma migrate deploy`.

## Checklist pré-produção

- [ ] `NODE_ENV=production`
- [ ] `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` ≥ 32 chars aleatórios
- [ ] `CORS_ORIGIN` = origem real do front (HTTPS)
- [ ] `APP_PUBLIC_URL` / `API_PUBLIC_URL` / `NEXT_PUBLIC_*` coerentes
- [ ] `ALLOW_BILLING_DEMO=false` (ignorado em prod pelo app, mas manter false)
- [ ] Stripe keys **ou** upgrades pagos desabilitados conscientemente
- [ ] MP: `MERCADOPAGO_ACCESS_TOKEN` + `MERCADOPAGO_WEBHOOK_SECRET` se PIX ativo
- [ ] Redis persistente (AOF/volume ou managed)
- [ ] `DATABASE_URL` com `connection_limit` adequado
- [ ] Cookies Secure no front/API (HTTPS)
- [ ] `GET /api/health` → 200; `GET /api/health/ready` → 200
- [ ] Backup testado (`BACKUP.md`)
- [ ] Swagger off em prod (`SWAGGER_ENABLED=false`) salvo necessidade

## Health

| Endpoint | Uso |
|----------|-----|
| `GET /api/health` | Liveness — PG up; Redis informativo |
| `GET /api/health/ready` | Readiness — PG + Redis; **503** se algum down |

Compose prod e Docker HEALTHCHECK usam `/api/health/ready`.

## CI

`.github/workflows/ci.yml`: format, lint, unit, e2e, Prisma validate + migrate, build API, build Web, audit (soft), docker build API.

## Observabilidade (plano — não instalado full stack)

1. Manter Pino + redação PII (já existe).
2. Alertas em ready=503 e taxa 5xx (provedor/UptimeRobot).
3. Quando houver tenants reais: Sentry (API+Web) + OpenTelemetry traces amostrados — ver audit § Observabilidade.
