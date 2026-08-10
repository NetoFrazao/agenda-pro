# Deploy — Agenda Pro (Fase 6)

> **Atualizado:** checklist operacional, TLS Caddy, CD/GHCR e health em [`DEPLOYMENT.md`](../DEPLOYMENT.md).  
> Variáveis: [`ENV.md`](./ENV.md) · Índice: [`DOCUMENTATION.md`](./DOCUMENTATION.md) · Scorecard DevOps: [`reviews/SCORECARD_DEVOPS.md`](./reviews/SCORECARD_DEVOPS.md) · Migration safety: [`reviews/SCORECARD_MIGRATION_SAFETY.md`](./reviews/SCORECARD_MIGRATION_SAFETY.md).

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
- Opcional: `STRIPE_*`, `SMTP_*`, `SENTRY_DSN` (SDK pendente — `docs/ops/SENTRY.md`)

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

## Rollout seguro: `20260810010000_architecture_integrity`

Migration de integridade (FKs, uniques parciais phone/waitlist, CHECKs, EXCLUDE GiST `slotRange` + trigger).  
Scorecard: [`reviews/SCORECARD_MIGRATION_SAFETY.md`](./reviews/SCORECARD_MIGRATION_SAFETY.md) · Scripts: [`scripts/migration-safety/`](../scripts/migration-safety/).

### Quando aplicar

- Depois do build/release que inclui o tip com fix GiST (`slotRange` + trigger; não use versões que tentavam `tstzrange(...)` direto no EXCLUDE — erro `42P17` no PG 16).
- Em **staging ou clone** primeiro; produção só com diagnose `OK` ou `WARN_DEDUP` consciente.
- Exige extensão `btree_gist` (a migration faz `CREATE EXTENSION IF NOT EXISTS`).

### Validar antes (obrigatório)

```bash
# Contra staging/clone — NUNCA produção às cegas
npm run db:migration-safety:diagnose -- --db <staging_or_clone>
# exit 0 = OK | 2 = WARN_DEDUP (mutará phones/waitlist) | 1 = BLOCK (overlaps)
```

| Achado | Ação |
|--------|------|
| **Overlaps ativos** (mesmo profissional, status `PENDING_PAYMENT`/`SCHEDULED`/`CONFIRMED`) | **Abortar deploy.** Resolver manualmente (cancelar/reagendar). A migration **não** dedupa overlaps; o `EXCLUDE` falha e a transaction inteira reverte (incluindo dedup de phone/waitlist). |
| Phones duplicados ativos | Esperado: soft-delete dos mais novos (`deletedAt`). Comunicar ao time; opcionalmente limpar antes. |
| Waitlist aberta duplicada | Esperado: `EXPIRED` nos mais novos. |
| Órfãos FK | Migration anula/`DELETE` defensivo — revisar contagens no diagnose. |

Rehearsal local (cópia Docker, não toca `agenda_pro` além de `pg_dump`):

```bash
npm run db:migration-safety:clone-migrate
# cria agenda_pro_mig_safety_r4, seed dirty, tenta migrate, resolve overlap, retenta
```

### Deploy

1. Backup lógico fresco (`npm run db:backup` / job agendado).
2. Diagnose no alvo → só seguir se não houver `BLOCK`.
3. `prisma migrate deploy` (`npm run db:migrate` ou `scripts/deploy-release.sh`).
4. Smoke: `GET /api/health/ready`, criar/listar appointment, booking sem overlap.

### Se abortar / reverter

- **Antes do migrate concluir:** nada a reverter no schema; corrigir overlaps e repetir.
- **Migrate falhou no meio:** Prisma marca failed — corrigir dados, `prisma migrate resolve` conforme docs Prisma se necessário, reaplicar. Em PG a migration costuma ser transacional: schema permanece pré-migration.
- **Já aplicada com sucesso:** rollback completo **não** é trivial (dropar EXCLUDE/`slotRange`/uniques/FKs/CHECKs). Preferir forward-fix; unwind SQL de clone (`scripts/migration-safety/unwind-architecture-integrity.sql`) é **só para rehearsal**, não para produção.
- Soft-deletes / `EXPIRED` feitos com sucesso são mutações de dados — restaurar via backup se precisar desfazer dedup.

### Breaking / avisos

- **Breaking de dados:** inserts que violem unique parcial phone/waitlist ou EXCLUDE passam a falhar no banco (app já deveria prevenir).
- **Aviso:** `slotRange` + trigger são SQL-only (coluna fora do Prisma Client).
- **Aviso:** buffer de agenda continua só na app; o EXCLUDE cobre `startsAt`/`endsAt` crus.

## Nota

Credenciais cloud são suas — o repo deixa CD/GHCR e scripts prontos; SSH secrets e DNS/TLS são do operador.
