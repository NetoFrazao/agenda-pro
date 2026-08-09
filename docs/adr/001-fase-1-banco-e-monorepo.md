# ADR 001 — Fase 1: modelagem do banco e setup do monorepo

## Problema

Precisamos de uma base sólida para um SaaS multi-tenant de agendamentos (barbeiros/manicures), com isolamento de dados, UTC no banco, planos comerciais futuros e qualidade de mercado (lint, testes, CI, Docker) desde o dia 1 — sem ainda implementar auth completa nem o motor de slots.

## Alternativas consideradas

1. **Repos separados (api + web)** — mais liberdade, pior DX e CI duplicado para portfólio.
2. **Fastify + TypeORM** — mais leve; TypeORM tem curva e migrations menos previsíveis que Prisma.
3. **NestJS + Prisma em monorepo npm** — estrutura modular, Swagger/DI nativos, schema SQL-first legível.
4. **Supabase/Firebase** — velocidade, mas esconde decisões que queremos defender em entrevista (tenant, locks, filas).

## Decisão

- Monorepo `apps/api` (NestJS) + `apps/web` (Next.js) com **npm workspaces**.
- **PostgreSQL + Prisma** com modelo centrado em `Tenant` (todo dado de negócio com `tenantId`).
- `startsAt`/`endsAt` em **UTC**; regras de disponibilidade em **minutos locais** + `timezone` IANA no tenant.
- Preço do serviço em **centavos por tenant** (`priceCents`), sem catálogo global.
- Docker Compose só para **Postgres + Redis**; API/Web no host (hot reload no Windows).
- ESLint + Prettier + Jest + GitHub Actions desde a Fase 1.
- Estrutura de `Subscription` / `PlanDefinition` e `NotificationJob` já no schema (evita rewrite na Fase 4/7).

## Trade-offs

| Prós | Contras |
|------|---------|
| NestJS facilita Swagger, guards e testes | Mais boilerplate que Fastify |
| Prisma migrations claras para entrevista | Constraints de overlap avançadas (EXCLUDE) exigem SQL raw depois |
| Monorepo unifica CI e versão | Repo fica maior; disciplina de boundaries necessária |
| Modelar planos/jobs cedo | Schema um pouco mais rico que o “CRUD mínimo” |

## Consequências

- Fase 2 pluga auth em `User` + `RefreshToken` sem migration estrutural grande.
- Fase 3 implementa overlap com transaction/`SELECT FOR UPDATE` + possível `EXCLUDE` GiST.
- Multi-tenant vaza menos se **toda** query usar `tenantWhere` / `assertTenantOwnership`.
