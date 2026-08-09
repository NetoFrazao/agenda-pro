# Database — Agenda Pro

## Stack

| Item | Valor |
|------|--------|
| Engine | PostgreSQL 16 |
| ORM | Prisma 6 |
| Schema | `apps/api/prisma/schema.prisma` |
| Migrations | `apps/api/prisma/migrations/**` |
| Multi-tenant | coluna `tenantId` em tabelas de negócio (sem RLS nesta fase) |

## Pool

Prisma usa o query param `connection_limit` na `DATABASE_URL` (ver `.env.example`).  
Compose prod injeta `DATABASE_CONNECTION_LIMIT` (default 10).

Regra prática: `connection_limit * réplicas_API` ≪ `max_connections` do Postgres (default 100).

## Índices (hot paths)

| Índice | Justificativa |
|--------|----------------|
| `appointments (professionalId, startsAt)` UNIQUE | anti double-booking + lookup de busy slots |
| `appointments (tenantId, startsAt)` | listagem dashboard / range |
| `appointments (tenantId, status, startsAt)` | reports `groupBy status` + range |
| `appointments (status, createdAt)` | PIX lifecycle órfãos `PENDING_PAYMENT` |
| `pix_charges (status, expiresAt)` | reconcile de charges expiradas |
| `clients (tenantId, deletedAt)` | CRM list |
| `services (tenantId, deletedAt)` | listagens soft-delete |
| `notification_jobs (status, scheduledFor)` | outbox / worker |

Booking path principal já era indexado antes da migration infra.

## Migrations

```bash
npm run db:generate
npm run db:migrate          # deploy (CI / prod)
npm run db:migrate:dev      # só local interativo
npx prisma validate --schema apps/api/prisma/schema.prisma
```

### Lock risk

`CREATE INDEX` (Prisma) adquire `ShareLock` — em tabelas grandes preferir janela de baixo tráfego.  
Para zero-downtime em prod madura: `CREATE INDEX CONCURRENTLY` manual + baseline Prisma (fora do fluxo padrão).

### Migration infra (20260809210000)

Só `CREATE INDEX` — sem DROP, sem alteração de colunas. Reversível com `DROP INDEX` se necessário.

## Soft-delete

`deletedAt` em Tenant / User / Service / Client. Índices compostos incluem `deletedAt` nos hot paths de listagem.

## O que não fazer agora

- RLS Postgres (custo operacional alto sem necessidade comprovada)
- Multi-região / read replicas
- EXCLUDE GiST para overlap (ADR marca como futuro; advisory lock + unique cobrem o MVP)
