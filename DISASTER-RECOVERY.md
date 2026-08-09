# Disaster Recovery — Agenda Pro

## Escopo

Falha de API, Postgres, Redis, worker (BullMQ no processo API) e migration.  
Não cobre perda de conta cloud do provedor sem backups externos.

## RPO / RTO

Ver `BACKUP.md`. Resumo: **RPO 24h / RTO 2h** (MVP). Meta pós-beta: RPO 1h (dumps frequentes ou PITR).

## Runbooks resumidos

### 1) API down

**Sintomas:** 5xx / timeout; health falha.  
**Checagem:** `GET /api/health` → se processo morto, LB/host.  
**Ações:**

1. Logs Pino (crash loop, OOM, env inválida no boot).
2. Restart container/serviço (`docker compose -f docker-compose.prod.yml restart api` ou restart no Railway).
3. Se boot falha em `validateEnv`, corrigir secrets (JWT ≥32, `DATABASE_URL`).
4. Se PG down → runbook Postgres.
5. Smoke: register/login + `GET /api/health/ready`.

### 2) Postgres down

**Sintomas:** health `database: down`; API 500 em queries.  
**Ações:**

1. `docker compose exec postgres pg_isready` (ou painel do provedor).
2. Disco/volume cheio? Liberar espaço.
3. Restart Postgres; aguardar healthy.
4. Se corrupção/perda: restore (`BACKUP.md`) + `db:migrate`.
5. Validar: `SELECT 1`, ready=200, booking e2e smoke.

### 3) Redis down

**Sintomas:** `/api/health/ready` → 503 `redis: down`; notificações degradam (jobs ficam no outbox).  
**Ações:**

1. Restart Redis; conferir AOF volume no compose prod.
2. API HTTP pode continuar se liveness só exige PG — **ready** falha até Redis voltar (intencional para LB).
3. Após Redis up: Engineering deve reconciliar `NotificationJob` PENDING (ver `INFRA-ENGINEERING-REQUESTS.md` / M-06).
4. Não flushar Redis em prod sem plano de reconciliação.

### 4) Worker down

**Sintomas:** e-mails/WA atrasados; BullMQ worker no mesmo processo da API — worker down ≈ API down ou fila travada.  
**Ações:**

1. Restart API (reinicia Worker).
2. Inspecionar `notification_jobs` com `status IN ('PENDING','PROCESSING','FAILED')`.
3. Longo prazo: processo worker separado (B-13) — pedido Engineering.

### 5) Migration failed

**Sintomas:** deploy falha em `prisma migrate deploy`; app versão nova incompatível.  
**Ações:**

1. **Não** rodar `migrate reset` em prod.
2. Ler erro Prisma/PG; se índice/constraint, avaliar retry após lock timeout.
3. Se migration parcial: inspecionar `_prisma_migrations` + schema real.
4. Rollback app para imagem anterior; corrigir migration em hotfix; reaplicar.
5. Migration só-índice (`20260809210000_*`): seguro dropar índice e remarcar se necessário.

### 6) Backup failed

**Sintomas:** script exit ≠0; arquivo vazio.  
**Ações:**

1. Dry-run + `pg_isready`.
2. Espaço em disco no host/`backups/`.
3. Credenciais `POSTGRES_USER`/`POSTGRES_DB`.
4. Alertar: sem backup válido, RPO vira “desde o último dump bom”.
5. Testar restore em DB descartável.

## Escalação

| Severidade | Exemplo | Ação |
|------------|---------|------|
| SEV-1 | PG perdido sem dump &lt;24h | Restore último bom + comunicar tenants |
| SEV-2 | API down &gt;15 min | Restart + logs + status page informal |
| SEV-3 | Redis down, HTTP ok | Restart Redis + fila |

## Próximos passos DR

- [ ] Snapshots automáticos do provedor PG
- [ ] Upload cifrado de dumps para object storage
- [ ] WAL/PITR quando houver receita recorrente
- [ ] Worker separado + reconciliação outbox (Engineering)
