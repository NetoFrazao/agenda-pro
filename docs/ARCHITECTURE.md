# Arquitetura — Agenda Pro

## Visão geral

SaaS multi-tenant de agendamentos para profissionais e pequenos estabelecimentos (beleza, barbearias, etc.).

```mermaid
flowchart TB
  Client[Cliente final] --> Public[/u/slug booking]
  Owner[Dono / equipe] --> Dash[Dashboard Next.js]
  Public --> API[NestJS API]
  Dash --> API
  API --> PG[(PostgreSQL)]
  API --> Redis[(Redis)]
  Redis --> Bull[BullMQ workers in-process]
  API --> MP[Mercado Pago PIX]
  API --> Stripe[Stripe Billing]
  Bull --> Email[SMTP]
  Bull --> WA[WhatsApp Evolution / wa.me]
```

## Monorepo

```
agenda-pro/
├── apps/api          NestJS + Prisma + BullMQ
├── apps/web          Next.js 15 (App Router)
├── packages/         (reservado)
├── docs/             Documentação
├── scripts/          Bootstrap, backup, restore
├── docker-compose.yml
└── docker-compose.prod.yml
```

## Multi-tenancy

- Cada estabelecimento é um `Tenant` (`slug` único).
- Usuários (`OWNER` / `MEMBER`) pertencem a um tenant.
- Dados de negócio sempre filtrados por `tenantId` da sessão JWT (não confiar em IDs do cliente sozinhos).
- E-mail de usuário é único **por tenant** (`@@unique([tenantId, email])`).

## Autenticação

- Access JWT em cookie httpOnly `ap_access` (+ Bearer para Swagger/integrações).
- Refresh em cookie `ap_refresh` (path `/api/auth`), rotação atômica, revoke-on-reuse.
- Body de login/register **não** devolve tokens (só cookies).
- `JwtStrategy` revalida usuário ativo e tenant não deletado a cada request.
- Login/forgot password tenant-aware (`tenantSlug` opcional).

## Autorização (RBAC atual)

| Papel | Poderes |
|-------|---------|
| `OWNER` | Mutações sensíveis: billing, settings, team, account LGPD, services/availability writes, etc. |
| `MEMBER` | Operação do dia a dia conforme controllers (leitura ampla; mutações OWNER-guarded) |

`RolesGuard` + `@Roles(UserRole.OWNER)` nas rotas críticas. Papéis mais finos (ADMIN/MANAGER/…) estão no roadmap, não no runtime atual.

## Domínios principais (API)

| Módulo | Responsabilidade |
|--------|------------------|
| `auth` | Register, login, refresh, reset senha |
| `appointments` | Booking, FSM de status, manageToken, slots |
| `availability` | Regras + exceções; engine de slots |
| `payments` / `pix-lifecycle` | PIX MP, webhook, expiração, idempotência |
| `billing` | Planos Stripe / fail-closed sem key |
| `clients` + `loyalty` | CRM, segmentos, ledger de pontos |
| `waitlist` | Lista de espera + notify-next atômico |
| `notifications` | Filas e-mail/WhatsApp |
| `account` | Export / exclusão LGPD |
| `health` | `/health` e `/health/ready` |
| `common/cache` | Redis cache perfil público |

## Motor de agenda

- Grid + buffer + min notice + timezone do tenant.
- Anti double-booking: transaction + advisory lock + unique `(professionalId, startsAt)` + overlap.
- FSM centralizada em `appointment-state.ts` (transições inválidas rejeitadas).
- `PENDING_PAYMENT`: PIX; expiração cancela e libera slot (`PixLifecycleService`).

## Frontend

- Design system **Graphite Studio** (tokens em `globals.css`, componentes em `ui.tsx`).
- Dashboard autenticado por cookie; `AuthGuard` faz probe `/api/auth/me`.
- Booking público `/u/[slug]`; manage link `/agendamento/[token]`.

## Observabilidade

- Logs estruturados (Pino); evitar PII/tokens.
- Health/ready para orquestradores.
- Plano OTel/Sentry documentado em `INFRASTRUCTURE-AUDIT.md` (não empilhado ainda).

## Escalabilidade (intenção)

| Componente | Escala horizontal |
|------------|-------------------|
| API | Sim (stateless + JWT) |
| Web | Sim (standalone Docker / Vercel) |
| Worker | Hoje in-process; compose prevê worker separado (pedido B-13) |
| Postgres | Vertical + índices; particionar só com volume |
| Redis | Cache + filas; ready falha se Redis down |
