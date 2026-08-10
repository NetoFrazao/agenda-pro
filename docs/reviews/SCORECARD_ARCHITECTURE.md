# SCORECARD — Architecture / Domain Refactor

| Campo | Valor |
|-------|--------|
| **Data** | 2026-08-10 |
| **Branch** | `cursor/saas-hardening-crm-infra` (GiST IMMUTABLE fix @ 2026-08-10) |
| **Escopo** | Split `AppointmentsService`, `packages/shared`, FKs/CHECs/EXCLUDE no Prisma |
| **Nota inicial (ARCHITECTURE_REVIEW)** | **6.5 / 10** |
| **Nota atual** | **8.1 / 10** |
| **Veredito** | God Object de agenda partido em serviços coesos + contratos compartilhados + integridade DB reforçada; residual em worker HTTP e pages web monolíticas (fora do ownership). |

Critério: 10 = bounded contexts claros, contratos monorepo sem drift, schema com FKs/CHECs e overlap DB; cada Alto residual −0.4 a −0.6.

---

## O que foi corrigido (Agent Architecture)

| # | Item | Status | Evidência |
|---|------|--------|-----------|
| 1 | Quebrar `AppointmentsService` (~970 linhas) | ✅ | `appointment-lifecycle`, `public-catalog`, `booking` (PIX), `manage-appointment`, `appointment-availability`, `appointment-side-effects` + facade |
| 2 | `packages/shared` (enums FE/API) | ✅ | `@agenda-pro/shared` com `PixChargeStatus` **incluindo `REFUNDED`**; web reexporta; api `domain-enums` + spec |
| 3 | FKs órfãs Waitlist / Loyalty / NotificationJob | ✅ | migration `20260810010000_architecture_integrity` + relations no `schema.prisma` |
| 4 | Unique parcial phone / waitlist aberta | ✅ | `clients_tenantId_phone_active_key`, `waitlist_tenant_date_phone_open_key` (+ dedup pré-índice) |
| 5 | CHECKs de domínio | ✅ | endsAt>startsAt, duration/price, rating 1–5, commission, loyalty, buffer, dayOfWeek |
| 6 | EXCLUDE/GiST overlap ativos | ✅ | `appointments_no_overlap_active` via coluna `slotRange` + trigger (`appointments_set_slot_range`); **sem** buffer no DB |
| 7 | Preservar AuthZ MEMBER / CSRF / PIX / Redis CB | ✅ | facade mantém `list` MEMBER scope; specs member/security/service atualizados |

### API / schema / web — Breaking e avisos

- **Não breaking de contrato HTTP**: controllers continuam via `AppointmentsService` facade (mesmas rotas/DTOs).
- **Schema / migrate**: `20260810010000_architecture_integrity` corrigida localmente (mesmo arquivo; só `--rolled-back` antes): `tstzrange(...)` STABLE → coluna física `slotRange` + trigger; EXCLUDE GiST na coluna. Ainda **pode falhar** se já houver (a) overlaps ativos no mesmo profissional, (b) phones duplicados ativos, (c) waitlist aberta duplicada. Deploy: staging primeiro; exige `btree_gist`.
- **Aviso resolvido (2026-08-10)**: erro `42P17` no EXCLUDE com `tstzrange(...)` — resolvido com `slotRange` + trigger (wrappers IMMUTABLE também falharam no PG 16); residual = overlaps de dados reais / buffer só na app / coluna fora do Prisma Client (SQL-only).
- **Web tipos**: `PixChargeStatus` passa a incluir `REFUNDED` — UI que faz exhaustiveness check precisa tratar o novo caso (aviso positivo / anti-drift).
- **Monorepo**: `npm run build` agora builda `@agenda-pro/shared` primeiro; web usa `transpilePackages`.
- **Fora de escopo (pendente)**: worker separado do processo HTTP; pages web monolíticas; FK composta multi-tenant `(id, tenantId)` em Appointment↔User/Client/Service.

---

## Testes

```text
npm run lint -w @agenda-pro/api   # OK (após prettier --fix)
npm run lint -w @agenda-pro/web   # OK
npm run test -w @agenda-pro/api   # 31 suites / 153 tests OK
```

Cobertura tocada:

- `appointments-member-scope.spec.ts` — MEMBER read scope (via facade harness)
- `appointments-security.spec.ts` — PIX gate, PAST_DUE, manageToken, reschedule cancel-before-enqueue
- `appointments.service.spec.ts` — side-effects / FSM / máscara PII
- `domain-enums.spec.ts` — shared ⊇ Prisma `PixChargeStatus` (REFUNDED)

---

## Notas (honesto)

| Momento | Nota | Por quê |
|---------|------|---------|
| ARCHITECTURE_REVIEW baseline | **6.5** | God Object + packages vazio + FKs/overlap DB |
| **Atual** | **8.1** | Split + shared + integrity migration |

**Por que não 9–10:** worker/reconcile ainda no processo HTTP; frontend sem feature folders; buffer de agenda não entra no EXCLUDE; unique parcial de e-mail soft-deleted user não migrado (Prisma `@@unique` absoluto permanece).

---

## Blockers / riscos de merge → `cursor/saas-hardening-crm-infra`

1. **Migration EXCLUDE** — GiST column+trigger fix aplicado; em DBs com overlaps ativos o `migrate deploy` ainda aborta (limpeza manual). Push remoto + migrate staging/prod pendentes.
2. **Dedup clients** — migration soft-deleta clientes duplicados por `(tenantId, phone)` (mantém o mais antigo); impacto CRM leve.
3. **Dependência workspace** — CI/Docker copiam `packages/shared` (Dockerfiles api/web atualizados no mínimo necessário).
4. **Sem push** nesta entrega — merge local/ff a critério do integrador.

---

## Arquivos tocados (principais)

- `apps/api/src/appointments/*` (split + facade + specs)
- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/20260810010000_architecture_integrity/`
- `packages/shared/**`
- `apps/web/src/lib/types.ts`, `next.config.ts`, `tsconfig.json`
- `apps/api|web/package.json`, root `package.json`
- `docs/reviews/SCORECARD_ARCHITECTURE.md`
