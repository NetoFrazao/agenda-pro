# Backup — Agenda Pro

## Objetivo

Backup lógico **agendado** do PostgreSQL via `pg_dump` + cópia off-host + alerta em falha + restore drill periódico.

## RPO / RTO propostos (MVP / beta)

| Métrica | Alvo sugerido | Notas |
|---------|---------------|--------|
| RPO | ≤ 24 h | Dump diário + `BACKUP_OFFHOST_DIR` |
| RTO | ≤ 2 h | Restore dump + migrate + smoke health |

## Backup sob demanda

```powershell
npm run db:backup:dry
npm run db:backup
```

```bash
chmod +x scripts/backup-postgres.sh scripts/backup-scheduled.sh
./scripts/backup-postgres.sh --dry-run
./scripts/backup-postgres.sh
```

Prod compose: `COMPOSE_FILE=docker-compose.prod.yml ./scripts/backup-postgres.sh`

## Agendamento (cron / Task Scheduler)

### Linux

```bash
export BACKUP_OFFHOST_DIR=/mnt/offhost/agenda-pro
export BACKUP_ALERT_WEBHOOK_URL=https://hooks.slack.com/...
export COMPOSE_FILE=docker-compose.prod.yml
./scripts/install-backup-cron.sh --dry-run
./scripts/install-backup-cron.sh   # 03:15 UTC diário → backup-scheduled.sh
# Opcional no cron env: RUN_RESTORE_DRILL=1
```

### Windows

```powershell
$env:BACKUP_OFFHOST_DIR = 'D:\backups-agenda-pro'
$env:BACKUP_ALERT_WEBHOOK_URL = 'https://hooks.slack.com/...'
powershell -File .\scripts\install-backup-task.ps1 -DryRun
powershell -File .\scripts\install-backup-task.ps1 -Time '03:15'
```

Alerta: webhook se `pg_dump` falhar ou dump &lt; 100 bytes.

## Restore

```powershell
powershell -File .\scripts\restore-postgres.ps1 -DumpFile backups\agenda-pro-XXXX.sql -DryRun
powershell -File .\scripts\restore-postgres.ps1 -DumpFile backups\agenda-pro-XXXX.sql -ConfirmRestore
```

```bash
./scripts/restore-postgres.sh --dump-file backups/agenda-pro-XXXX.sql --dry-run
./scripts/restore-postgres.sh --dump-file backups/agenda-pro-XXXX.sql --confirm
```

## Restore drill

Local:

```powershell
npm run db:restore:drill -- -DumpFile backups\agenda-pro-XXXX.sql
```

```bash
./scripts/restore-drill.sh --dump-file backups/agenda-pro-XXXX.sql
```

CI periódico: `.github/workflows/restore-drill.yml` (segundas 04:30 UTC) aplica fixture `ops/fixtures/restore-drill-smoke.sql` em Postgres efêmero e publica artefato.

## Monitoramento de readiness

```powershell
$env:HEALTH_READY_URL = 'https://app.seudominio.com/api/health/ready'
$env:HEALTH_ALERT_WEBHOOK_URL = 'https://hooks.slack.com/services/...'
npm run ops:watch-ready
```

GitHub Actions: `health-probe.yml` (a cada 15 min) — configure `HEALTH_READY_URL` + `HEALTH_ALERT_WEBHOOK_URL`.

## O que não está coberto

- PITR / WAL archiving (`DISASTER-RECOVERY.md`)
- Criptografia at-rest nativa do dump (cifrar antes do sync cloud)
- Redis AOF como SoT (fila reconstruível via outbox)
- Upload S3 SDK (use `BACKUP_OFFHOST_DIR` + rclone/sync)
