# Agenda Pro

SaaS multi-tenant de **agendamentos** para barbeiros, manicures e pequenos estabelecimentos — pronto para evolução comercial (segurança, PIX, CRM, infra e UX Graphite).

## Status

| Camada | Status |
|--------|--------|
| MVP fases 0–7 (legado) | ✅ |
| Paridade de mercado (fase 8 produto) | ✅ |
| Hardening produção (seg/CRM/infra/perf) | ✅ na branch `cursor/saas-hardening-crm-infra` |
| Suíte E2E frontend (Playwright) | ⏳ backlog |
| Observabilidade full (Sentry/OTel) | ⏳ planejado |

Relatório consolidado: **[docs/reviews/FINAL-AUDIT.md](./docs/reviews/FINAL-AUDIT.md)** · Índice: **[docs/DOCUMENTATION.md](./docs/DOCUMENTATION.md)** · Reviews: **[docs/reviews/](./docs/reviews/)**

## Stack

Next.js 15 · NestJS · Prisma · PostgreSQL · Redis/BullMQ · JWT (cookies httpOnly) · Stripe · Mercado Pago PIX · Docker · GitHub Actions

## Quick start

```powershell
cd agenda-pro
Copy-Item .env.example .env
npm run docker:up
npm install
npm run db:generate
npm run db:migrate
npm run prisma:seed -w @agenda-pro/api
npm run dev:api   # http://localhost:3001/docs
npm run dev:web   # http://localhost:3000
```

Guia completo: [docs/SETUP.md](./docs/SETUP.md) · Variáveis: [docs/ENV.md](./docs/ENV.md)

**Seed demo:** `dono@demo.local` / `SenhaDemo123!` · slug `demo-barbearia` · `/u/demo-barbearia`

```powershell
npm run lint
npm run test
npm run test:e2e -w @agenda-pro/api
```

## Capacidades principais

- Booking público multi-profissional + manage link
- Anti double-booking (lock + constraint + testes de corrida)
- PIX (Mercado Pago) com webhook assinado e lifecycle
- Billing Stripe fail-closed sem chave em produção
- CRM: segmentos, métricas, loyalty ledger, retenção 30/60/90
- LGPD: export + exclusão anonimizada
- Notificações e-mail/WhatsApp (Evolution ou `wa.me`)
- Health `/api/health` + ready `/api/health/ready`
- Design system Graphite (acessível, mobile)

## Rotas (amostra)

| Área | Exemplos |
|------|----------|
| Auth | `POST /api/auth/register\|login\|refresh` · `GET /api/auth/me` |
| Público | `GET /api/public/:slug` · slots · book · manage token |
| Agenda | `GET /api/appointments` → `{ items, total, page, pageSize }` |
| CRM | `/api/clients` · consent · profile |
| Billing | `/api/billing/*` |
| LGPD | `POST /api/account/export` `{ password }` · `DELETE /api/account` `{ password }` (step-up) |
| Health | `/api/health` · `/api/health/ready` |

Contratos: [docs/API.md](./docs/API.md) · Arquitetura: [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) · Segurança: [docs/SECURITY.md](./docs/SECURITY.md)

## Produção e ops

| Doc | Tema |
|-----|------|
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Checklist, TLS Caddy, CD/GHCR |
| [BACKUP.md](./BACKUP.md) | Backup agendado + drill |
| [DISASTER-RECOVERY.md](./DISASTER-RECOVERY.md) | RPO/RTO / runbooks |
| [docs/reviews/SCORECARD_DEVOPS.md](./docs/reviews/SCORECARD_DEVOPS.md) | Nota DevOps |
| [docs/reviews/INFRASTRUCTURE-AUDIT.md](./docs/reviews/INFRASTRUCTURE-AUDIT.md) | Auditoria infra |

```powershell
npm run docker:prod:up
npm run docker:prod:tls:config   # sanity TLS overlay
npm run db:backup:dry
npm run ops:audit
```

## Git / GitHub Desktop

Branch DevOps: `cursor/agent-devops` (base `cursor/saas-hardening-crm-infra`).

Se ainda não houver `origin`:

1. Abra o repo no **GitHub Desktop** (`github .`)
2. **Publish repository** / **Publish branch**
3. Confirme com `git remote -v`

## Estrutura

```
apps/api     NestJS + Prisma + filas + PIX/billing
apps/web     Next.js (dashboard + booking + design system)
docs/        Documentação + docs/reviews (auditorias)
deploy/      Caddyfile + certs locais
scripts/     Bootstrap, backup, CD, audit, health
ops/         Allowlist audit + fixtures drill
```
