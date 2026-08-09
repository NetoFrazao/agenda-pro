# Agenda Pro

Mini-SaaS de **agendamentos inteligentes** para **barbeiros e manicures** — portfólio júnior/pleno e base de produto cobrável.

## Status das fases

| Fase | Conteúdo | Status |
|------|----------|--------|
| 0 | Escopo / MVP | ✅ |
| 1 | Banco + monorepo + CI | ✅ |
| 2 | Auth JWT | ✅ |
| 3 | Disponibilidade + anti double-booking | ✅ |
| 4 | Filas e-mail/WhatsApp + webhook Stripe | ✅ |
| 5 | Frontend dashboard + booking público | ✅ |
| 6 | Deploy docs + case study | ✅ (guia) |
| 7 | Planos/Stripe demo + LGPD + termos | ✅ |

## Stack

Next.js 15 · NestJS · Prisma · PostgreSQL · Redis/BullMQ · JWT · Stripe (opcional) · Docker Compose · GitHub Actions

## Diferenciais MVP

- Lembrete **WhatsApp** (`wa.me`) + e-mail assíncrono
- Preço de serviço **por conta**
- UI PT-BR
- Sinal PIX preparado no schema (`depositCents`)

## Subir localmente

```bash
# Pré-requisitos: Node 20+, Docker Desktop
cd agenda-pro
cp .env.example .env

docker compose up -d
npm install
npm run db:generate
npm run db:migrate
npm run prisma:seed -w @agenda-pro/api

npm run dev:api   # http://localhost:3001/docs
npm run dev:web   # http://localhost:3000
```

Seed demo: `dono@demo.local` / `SenhaDemo123!` · slug `demo-barbearia` · booking em `/u/demo-barbearia`

```bash
npm run test
npm run lint
npm run format:check
```

## Rotas principais

| Área | Exemplos |
|------|----------|
| Auth | `POST /api/auth/register\|login\|refresh` · `GET /api/auth/me` |
| Dashboard | `/api/services` · `/api/availability/rules` · `/api/appointments` |
| Público | `GET /api/public/:slug` · `.../slots` · `POST .../book` |
| Billing | `GET /api/billing/plans` · `POST .../checkout` · `POST .../cancel` |
| LGPD | `DELETE /api/account` |

## Docs

- [Escopo Fase 0](./docs/FASE-0-ESCOPO.md)
- [Deploy](./docs/DEPLOY.md)
- [Case study checklist](./docs/CASE-STUDY-CHECKLIST.md)
- [ADRs](./docs/adr/)
- [Entrevista](./docs/ENTREVISTA-FASES-2-7.md)

## Estrutura

```
apps/api   NestJS + Prisma
apps/web   Next.js (dashboard + /u/[slug] + planos/termos)
```
