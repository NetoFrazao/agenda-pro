# SCORECARD — Migration Safety (architecture_integrity)

| Campo | Valor |
|-------|--------|
| **Data** | 2026-08-10 |
| **Branch** | `cursor/agent-migration-safety-r4` |
| **Base** | `6a8165c` (`cursor/saas-hardening-crm-infra` — GiST `slotRange` + trigger) |
| **Migration** | `20260810010000_architecture_integrity` |
| **Agente** | Segurança do Banco / Migração (R4) |
| **Nota** | **8.4 / 10** |

---

## Veredito

Há tooling real de **pré-check + rehearsal em clone Docker** (não produção) para a migration de integridade. Evidência local mostra: diagnose detecta overlaps/phones/waitlist; `migrate deploy` **falha** com `23P01` se houver overlap ativo; após cancelar o overlap posterior, migrate **aplica** e o dedup soft-delete/EXPIRED ocorre como documentado. Residual: sem staging remoto exercitado; Prisma CLI precisa estar no monorepo (script evita `npx prisma` latest); buffer de agenda continua só na app.

---

## Backlog deste round

| # | Item | Pri | Status | Evidência |
|---|------|-----|--------|-----------|
| 1 | Script diagnóstico pré-migration (overlaps / phones / waitlist) | Crítico | **Feito** | `scripts/migration-safety/diagnose.mjs` + SQL |
| 2 | Aplicar migration contra **cópia** do DB + documentar | Crítico | **Feito** | clone `agenda_pro_mig_safety_r4` via `run-clone-migrate.ps1` |
| 3 | Documentar rollout seguro | Alto | **Feito** | `docs/DEPLOY.md` § Rollout seguro |

Escopo respeitado: **não** alterou `apps/**` (só leu migration existente).

---

## Evidência real (clone local Docker) — 2026-08-10 ~10:07Z

**Ambiente:** container `agenda-pro-postgres`, source `agenda_pro` (dump 53930 bytes), clone `agenda_pro_mig_safety_r4`.  
**Não** é staging cloud nem produção. Fixtures dirty foram seedadas no clone após unwind.

### Diagnose PRE (com seed)

```json
{
  "overlap_pairs": 1,
  "phone_soft_deletes": 1,
  "waitlist_expires": 1,
  "verdict": "BLOCK"
}
```

Arquivo: `scripts/migration-safety/evidence/diagnose-pre-20260810-070734.json`

### Migrate attempt #1 (esperado falhar)

- Prisma **6.19.3** (CLI do monorepo sibling — **não** npx@7)
- **P3018** / PG **23P01**: `could not create exclusion constraint "appointments_no_overlap_active"`
- DETAIL: conflito `slotRange` no mesmo `professionalId` (seed 14:00–15:00 vs 14:30–15:30)
- Transaction abort → dedup **não** persistiu (confirmado: mid-diagnose ainda `WARN_DEDUP`)

### Após resolve overlap + `migrate resolve --rolled-back`

- Attempt #2: **All migrations have been successfully applied** (exit 0)
- Constraints: `has_exclude=t`, `has_phone_unique=t`, `has_waitlist_unique=t`, `has_slot_range=t`, `migration_applied=1`

### Dedup efetivo (pós-sucesso)

| Seed row | Resultado |
|----------|-----------|
| `seed_client_keep_phone` | mantido (`deletedAt` null) |
| `seed_client_dup_phone` | **soft-deleted** |
| `seed_waitlist_open_a` | `WAITING` (kept) |
| `seed_waitlist_open_b` | **EXPIRED** |
| `seed_appt_overlap_b` | `CANCELLED` (resolve manual pré-EXCLUDE) |

Diagnose POST: `verdict=OK` (0 overlaps, 0 pending dedups).  
Resumo: `scripts/migration-safety/evidence/RESULT-20260810-070734.md`

### Diagnose no source `agenda_pro` (sem seed)

Rodar: `npm run db:migration-safety:diagnose -- --db agenda_pro` — DB de dev já tinha a migration aplicada e 0 appointments/clients/waitlist de negócio; rehearsal usou clone + fixtures para forçar caminhos BLOCK/WARN/OK.

---

## Breaking / avisos

| Tipo | Detalhe |
|------|---------|
| **Breaking (dados)** | Overlaps ativos **bloqueiam** o deploy da migration; exige limpeza manual antes |
| **Breaking (runtime)** | Após apply, inserts que violem unique phone/waitlist ou EXCLUDE falham no PG |
| **Aviso** | Dedup muta dados (soft-delete / EXPIRED); comunicar stakeholders se `WARN_DEDUP` |
| **Aviso** | Falha no EXCLUDE reverte a transaction inteira (incluindo dedup) — Prisma marca failed → `migrate resolve --rolled-back` antes de retentar |
| **Aviso** | `unwind-architecture-integrity.sql` é **só clone/rehearsal**, nunca produção |
| **Aviso** | Script de migrate usa Prisma v6 local; `npx prisma` sem pin pode puxar v7 (P1012) |
| **Não breaking HTTP** | Sem mudanças de API neste agente |

---

## Artefatos

| Path | Papel |
|------|--------|
| `scripts/migration-safety/` | Diagnose, seed, unwind, clone-migrate, README |
| `docs/DEPLOY.md` | Rollout seguro |
| `package.json` | `db:migration-safety:diagnose` / `db:migration-safety:clone-migrate` |
| `docs/reviews/SCORECARD_MIGRATION_SAFETY.md` | Este scorecard |

Referência cruzada: architecture scorecard menciona a mesma migration (`docs/reviews/SCORECARD_ARCHITECTURE.md`).

---

## Nota / residual (−1.6 vs 10)

1. Staging remoto / dump de prod sanitizado não disponível — só clone Docker local.  
2. Worktree sem `node_modules`; rehearsal usou CLI Prisma do sibling `agenda-pro`.  
3. Sem CI job dedicado ao diagnose (poderia gatear CD).  
4. Resolve de overlap no rehearsal é “cancel later”; produção precisa de política de negócio (reagendar vs cancelar).
