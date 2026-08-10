# Migration safety — `20260810010000_architecture_integrity`

Ferramentas para **diagnosticar antes** e **ensaiar migrate em cópia** do Postgres.
**Nunca** rode o rehearsal (`run-clone-migrate.ps1`) contra produção.

## O que a migration faz (risco)

| Área | Comportamento | Risco |
|------|---------------|-------|
| Overlaps ativos (mesmo `professionalId`) | `EXCLUDE` GiST em `slotRange` | **BLOCKER** — migration falha; **não** auto-resolve |
| Phones ativos duplicados (`tenantId`,`phone`) | soft-delete `deletedAt` nos rn>1 (mantém mais antigo) | Mutação de dados |
| Waitlist aberta duplicada | `status=EXPIRED` nos rn>1 | Mutação de dados |
| FKs órfãs / CHECKs | limpa órfãos + adiciona constraints | Baixo se dados válidos |

Prisma aplica a migration numa transaction: se o EXCLUDE falhar, **dedup também reverte**.

## Comandos

```bash
# Diagnóstico (Docker local agenda-pro-postgres)
npm run db:migration-safety:diagnose -- --db agenda_pro
npm run db:migration-safety:diagnose -- --db agenda_pro --verbose --json-out scripts/migration-safety/evidence/out.json

# Clone local + seed dirty + migrate rehearsal (cria agenda_pro_mig_safety_r4)
npm run db:migration-safety:clone-migrate
```

Exit codes do diagnose:

| Code | Verdict |
|------|---------|
| 0 | `OK` |
| 2 | `WARN_DEDUP` — migrate vai soft-delete/expire duplicatas |
| 1 | `BLOCK` — overlaps ativos (ou erro de tooling) |

## Arquivos

| File | Uso |
|------|-----|
| `diagnose-architecture-integrity.sql` | Relatório humano |
| `diagnose-summary.sql` | Uma linha máquina |
| `diagnose.mjs` | Runner + JSON + exit codes |
| `unwind-architecture-integrity.sql` | Remove objetos da migration **só em clone** |
| `seed-dirty-fixtures.sql` | Fixtures de overlap/phone/waitlist |
| `resolve-overlaps-cancel-later.sql` | Cancela appointment posterior em pares overlap |
| `run-clone-migrate.ps1` | Dump → clone → unwind → seed → diagnose → migrate |
| `evidence/` | Artefatos de rehearsal (RESULT-*.md, JSON, logs) |

## Rollout

Ver seção em [`docs/DEPLOY.md`](../../docs/DEPLOY.md) — *Rollout seguro: architecture_integrity*.
