# Agenda Pro

Mini-SaaS de **agendamentos inteligentes** para **barbeiros e manicures** (autônomos ou pequenos salões).

Objetivos: portfólio de nível júnior/pleno **e** base de um produto cobrável (SaaS).

## Status

| Fase | Conteúdo | Status |
|------|----------|--------|
| 0 | Escopo, stack, MVP vs bônus | ✅ |
| 1 | Banco + monorepo + Docker + lint + CI | ✅ (esta entrega) |
| 2 | Auth / cadastro de profissionais | ⏳ |
| 3 | Motor de disponibilidade + anti double-booking | ⏳ |
| 4 | Filas (e-mail / WhatsApp) + webhooks | ⏳ |
| 5 | Frontend dashboard + página pública | ⏳ |
| 6 | Deploy + README case study | ⏳ |
| 7 | Stripe/PIX + LGPD + termos | ⏳ pós-MVP |

## Stack (travada na Fase 0)

- **Web**: Next.js 15 + Tailwind CSS
- **API**: NestJS + TypeScript + Prisma + PostgreSQL
- **Fila**: Redis + BullMQ (a partir da Fase 4)
- **Auth**: JWT access + refresh (Fase 2)
- **Monorepo**: npm workspaces (`apps/api`, `apps/web`)

## Diferencial do MVP (nicho BR)

- Lembrete via **WhatsApp** (`wa.me` + template) + **e-mail** pela fila
- UI e copy em **português**
- Preço de serviço **por profissional** (sem tabela global)
- Estrutura pronta para **sinal PIX** e assinatura (Fase 7)

## Pré-requisitos

- Node.js 20+
- **Docker Desktop** (Postgres + Redis) — obrigatório para a API falar com o banco
- Git

> Se o Docker ainda não estiver instalado no Windows:  
> `winget install Docker.DockerDesktop` — depois abra o Docker Desktop e confirme que o engine está rodando.

## Subir localmente (Fase 1)

```bash
# 1) Entrar no projeto
cd ~/Projects/agenda-pro

# 2) Env
cp .env.example .env

# 3) Infra (Postgres + Redis)
docker compose up -d

# 4) Dependências (se ainda não instalou)
npm install

# 5) Prisma Client + aplicar migration já versionada
npm run db:generate
npm run db:migrate

# 6) Seed opcional (tenant demo + planos)
npm run prisma:seed -w @agenda-pro/api

# 7) API
npm run dev:api
# Swagger: http://localhost:3001/docs
# Health:  http://localhost:3001/api/health

# 8) Web (placeholder da Fase 1)
npm run dev:web
# http://localhost:3000
```

### Testes e qualidade

```bash
npm run lint
npm run test
npm run format:check
```

## Estrutura

```
agenda-pro/
├── apps/
│   ├── api/          # NestJS + Prisma
│   └── web/          # Next.js
├── docs/             # ADRs e decisões
├── docker-compose.yml
└── .github/workflows/ci.yml
```

## Documentação de decisões

- [Fase 0 — Escopo](./docs/FASE-0-ESCOPO.md)
- [ADR Fase 1 — Banco e monorepo](./docs/adr/001-fase-1-banco-e-monorepo.md)
- [Perguntas de entrevista — Fase 1](./docs/ENTREVISTA-FASE-1.md)

## Licença

Uso educacional / portfólio — ajuste antes de comercializar.
