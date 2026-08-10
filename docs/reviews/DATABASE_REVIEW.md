# DATABASE_REVIEW — Agenda Pro

**Escopo:** PostgreSQL / Prisma (`apps/api/prisma`), queries em services  
**Data:** 2026-08-09  
**Alterações de schema/código:** nenhuma (somente este documento)

## Nota: **6.5 / 10**

Base sólida para MVP: `tenantId` em entidades de negócio, FKs com cascades coerentes, índices compostos alinhados a reports/CRM/PIX, e booking com **advisory lock + checagem de overlap + unique**. A nota cai por um bug de integridade no unique de agenda (cancelados bloqueiam o slot), ausência de garantia DB contra overlap parcial / cross-tenant, e alguns FKs/constraints faltando em tabelas periféricas.

---

## Top issues (resumo)

| # | Gravidade | Problema |
|---|-----------|----------|
| 1 | **Alta** | `UNIQUE (professionalId, startsAt)` inclui cancelados/no-show — impede rebook do mesmo horário |
| 2 | **Alta** | Overlap parcial só na app; sem `EXCLUDE`/GiST no Postgres |
| 3 | **Alta** | Sem garantia DB de que `professional`/`client`/`service` pertencem ao mesmo `tenantId` |
| 4 | **Média** | `Client (tenantId, phone)` não é unique — race cria duplicatas |
| 5 | **Média** | Soft-delete + uniques absolutos; FKs/CHECKs ausentes; migrations com lock risk |

---

## Pontos fortes

- Multi-tenant explícito no schema (`Tenant` + `tenantId` nas tabelas de negócio); comentário exige filtro por tenant nas queries.
- Anti double-booking em camadas: `pg_advisory_xact_lock(hashtext(professionalId))` + overlap em TX + `@@unique([professionalId, startsAt])` + tratamento `P2002` (`appointments.service.ts`).
- Índices compostos justificados (`tenantId+status+startsAt`, CRM `tenantId+clientId+status+startsAt`, PIX `status+expiresAt`, soft-delete lists).
- Fidelidade idempotente: `@@unique([appointmentId, type])` + catch `P2002` em `loyalty-credit.ts`.
- Cascades sensatos: filhos do tenant em `Cascade`; appointment → professional/client/service em `Restrict` (protege histórico).
- Snapshots de preço/duração no appointment evitam drift se o serviço mudar.

---

## Problemas

### 1. Unique de booking bloqueia reuso após cancelamento / no-show

| | |
|---|---|
| **Gravidade** | Alta |
| **Evidência** | `schema.prisma` `Appointment`: `@@unique([professionalId, startsAt])` sem filtro de status. `ACTIVE_APPOINTMENT_STATUSES` = só `PENDING_PAYMENT \| SCHEDULED \| CONFIRMED` (`availability.engine.ts`). Overlap em `bookPublic`/`reschedule` ignora `CANCELLED`/`NO_SHOW`/`COMPLETED`, mas o unique do Postgres **não**. Após cancelar (ex.: PIX expirado → `CANCELLED` em `pix-lifecycle.service.ts`), um novo booking no mesmo `startsAt` falha com `P2002` → `ConflictException('Horário acabou de ser reservado')`. |
| **Solução** | Trocar o unique absoluto por **índice único parcial** (SQL manual / migration raw): `CREATE UNIQUE INDEX ... ON appointments (professionalId, startsAt) WHERE status IN ('PENDING_PAYMENT','SCHEDULED','CONFIRMED')`. Idealmente complementar com `EXCLUDE` (issue 2). Remover o `@@unique` Prisma ou documentar que o partial vive só no SQL. |
| **Esforço** | M (migration + ajuste Prisma + testes de cancel→rebook) |

---

### 2. Overlap parcial sem garantia no banco

| | |
|---|---|
| **Gravidade** | Alta |
| **Evidência** | Comentário no schema (linhas 8–9, 331–333): unique só no mesmo `startsAt`; “overlap na Fase 3” fica na app. `bookPublic` faz `findMany` por janela `startsAt`/`endsAt` + `hasOverlap` **dentro** do advisory lock — correto se **todo** write passar por esse caminho. Qualquer insert/update paralelo (admin, seed, bug, job) com `startsAt` diferente pode criar intervalos sobrepostos. Índice `(professionalId, startsAt)` ajuda o range, mas não impede overlap. |
| **Solução** | `EXCLUDE USING gist (professionalId WITH =, tstzrange("startsAt","endsAt",'[)') WITH &&) WHERE status IN (...)` (extensão `btree_gist`). Manter advisory lock para serializar a UX; o EXCLUDE é a rede de segurança. |
| **Esforço** | M–L (extension, migration, backfill de conflitos existentes) |

---

### 3. Integridade multi-tenant só na aplicação

| | |
|---|---|
| **Gravidade** | Alta |
| **Evidência** | `Appointment` tem FKs separadas para `tenantId`, `professionalId` → `users`, `clientId` → `clients`, `serviceId` → `services`, sem constraint composta. O app filtra bem (`resolveProfessional(tenantId, ...)`, `service.findFirst({ tenantId })`), mas o DB aceitaria appointment com profissional de outro tenant. `WaitlistEntry.serviceId` / `professionalId` **sem FK**. `LoyaltyTransaction.appointmentId` **sem FK**. `NotificationJob` sem relação Prisma/FK para `tenants`/`appointments`. |
| **Solução** | Curto prazo: FKs faltantes (`waitlist`→service/user opcional; `loyalty`→appointment; `notification_jobs`→tenant). Médio: uniques compostos `(id, tenantId)` nas tabelas pai + FK composta `(professionalId, tenantId)` → `(users.id, users.tenantId)` (e análogo para client/service). |
| **Esforço** | M |

---

### 4. Cliente por telefone sem unique (race / duplicatas)

| | |
|---|---|
| **Gravidade** | Média |
| **Evidência** | `Client`: `@@index([tenantId, phone])` — não unique. `bookPublic` faz `findFirst` + `create` sob lock **por profissional**; dois bookings simultâneos para profissionais distintos do mesmo tenant com o mesmo telefone podem criar dois `Client`. Waitlist: `findFirst` + `create` sem unique (`waitlist.service.ts`) — race gera entradas duplicadas WAITING. |
| **Solução** | Unique parcial: `(tenantId, phone) WHERE deletedAt IS NULL`. Waitlist: unique parcial `(tenantId, dateKey, clientPhone) WHERE status IN ('WAITING','NOTIFIED')`. Upsert / `ON CONFLICT` no service. |
| **Esforço** | S–M |

---

### 5. Soft-delete conflita com uniques absolutos

| | |
|---|---|
| **Gravidade** | Média |
| **Evidência** | `User`: `@@unique([tenantId, email])` sem exclusão de `deletedAt`. `team.service` soft-delete (`deletedAt`); reconvidar o mesmo e-mail falha com `P2002`. Mesmo padrão potencial em slug de tenant se “reabrir” conta. |
| **Solução** | Unique parcial `WHERE deletedAt IS NULL` (Prisma não modela partial unique nativamente — migration SQL + comentário no schema). |
| **Esforço** | S |

---

### 6. CHECKs de domínio ausentes

| | |
|---|---|
| **Gravidade** | Média |
| **Evidência** | Sem `CHECK` em migrations/schema para: `endsAt > startsAt`; `durationMinutes > 0`; `priceCents >= 0`; `dayOfWeek BETWEEN 0 AND 6`; `startMinute < endMinute`; `Review.rating` 1–5; `commissionPercent` 0–100; `loyaltyPoints >= 0`; `bufferMinutes >= 0`. Validação só na app/DTO. |
| **Solução** | Adicionar CHECKs nas migrations (ou raw SQL) nas colunas críticas. |
| **Esforço** | S |

---

### 7. Riscos de migration / locks em produção

| | |
|---|---|
| **Gravidade** | Média |
| **Evidência** | `20260809210000_infra_query_indexes` e `20260809250000_phase7_crm_metrics_index`: `CREATE INDEX` **sem** `CONCURRENTLY` (comentário no SQL já admite ShareLock). `20260809223000_phase4_pix_refunded`: recria enum (`ALTER ... TYPE` + drop/rename) — típico `AccessExclusiveLock` em `pix_charges`. `20260809120000_phase8_market_parity`: add `manageToken` nullable → backfill `md5(random()...)` → `SET NOT NULL` + unique (ok em volume baixo; em tabela grande, rewrite/lock). |
| **Solução** | Em prod: índices novos via `CREATE INDEX CONCURRENTLY` fora da transaction do Prisma (ou expand/contract). Preferir `ALTER TYPE ... ADD VALUE` quando possível (já usado em `NotificationJobType`). Evitar rewrite de enum em horário de pico. |
| **Esforço** | S (processo) / M (reaplicar índices grandes) |

---

### 8. Loyalty unique com `appointmentId` NULL

| | |
|---|---|
| **Gravidade** | Baixa–Média |
| **Evidência** | `@@unique([appointmentId, type])`. Em PostgreSQL, `NULL`s são distintos → vários `(NULL, CREDIT)` permitidos. Migration phase5 insere `MIGRATION` com `appointmentId` NULL; o `NOT EXISTS` por `reason` mitiga reaplicação, mas o unique **não** impede créditos órfãos duplicados sem appointment. |
| **Solução** | Unique parcial só quando `appointmentId IS NOT NULL`; para migração, unique `(clientId, reason)` onde `reason = 'MIGRATION'`, ou FK obrigatória em créditos `COMPLETED_VISIT`. |
| **Esforço** | S |

---

### 9. NotificationJob: claim sem CAS / sem FK

| | |
|---|---|
| **Gravidade** | Baixa–Média |
| **Evidência** | `processJob`: `findUnique` → se não COMPLETED, `update` para PROCESSING sem `WHERE status = PENDING`. Dois workers/retries podem processar o mesmo job (risco de e-mail/WhatsApp duplicado). Sem FK: `appointmentId`/`tenantId` podem apontar para IDs inexistentes após purge parcial. |
| **Solução** | `UPDATE ... WHERE id = $1 AND status = 'PENDING' RETURNING *` (ou status IN PENDING/FAILED retry). Adicionar FKs. Índice `(status, scheduledFor)` já existe — bom para pollers. |
| **Esforço** | S |

---

### 10. Lacunas menores de índice / concorrência

| | |
|---|---|
| **Gravidade** | Baixa |
| **Evidência** | Query de busy usa `endsAt > X AND startsAt < Y` — `(professionalId, startsAt)` cobre parcialmente; GiST (issue 2) resolve de vez. `Reviews` públicos: `(tenantId, isPublished)` sem `createdAt` (ORDER BY recente pode sort em heap). Advisory `hashtext` → `int4`: colisão teórica entre profissionais diferentes serializa um ao outro (não corrompe; só contende). |
| **Solução** | Priorizar EXCLUDE/GiST; opcional `(tenantId, isPublished, createdAt DESC)`. Lock: `hashtextextended` / dois-int key se quiser isolar melhor. |
| **Esforço** | S |

---

## Mapa rápido: constraints atuais

| Área | Estado |
|------|--------|
| FK tenant → filhos | Cascade — OK |
| FK appointment → user/client/service | Restrict — OK |
| Unique slot ativo | **Falho** (inclui cancelados) |
| Overlap intervalo | Só app + advisory |
| Multi-tenant composto | Ausente |
| Client phone unique | Ausente (só index) |
| Waitlist dedupe DB | Ausente |
| Loyalty idempotência CREDIT | OK (com appointmentId) |
| CHECK domínio | Ausente |
| Índices hot-path | Bom (reports/CRM/PIX) |
| Migrations prod-safe | Parcial (sem CONCURRENTLY; enum rewrite) |

---

## Recomendações priorizadas

1. **Imediato:** unique parcial de appointments por status ativo (desbloqueia rebook pós-cancel/PIX).
2. **Curto prazo:** unique parcial client phone; unique waitlist ativa; CHECKs básicos (`endsAt > startsAt`, rating).
3. **Curto/médio:** FKs órfãs + (opcional) FKs compostas multi-tenant.
4. **Médio:** `EXCLUDE ... gist` para overlap; claim atômico em NotificationJob.
5. **Ops:** política de índice `CONCURRENTLY` e migrations de enum em janela controlada.

---

## Nota detalhada (rubrica)

| Critério | Peso | Nota | Comentário |
|----------|------|------|------------|
| FKs / cascades | 20% | 7 | Core bom; periféricos incompletos |
| Uniques / integridade booking | 25% | 5 | Unique absoluto contradiz lifecycle |
| Multi-tenant no DB | 15% | 5 | Coluna + app; sem constraint cruzada |
| Índices | 15% | 8 | Cobertura alinhada às queries |
| Concorrência | 15% | 7 | Advisory + TX bem feitos; falta EXCLUDE |
| Migrations / riscos | 10% | 6 | Comentários honestos; locks clássicos Prisma |

**Média ponderada ≈ 6.5**
