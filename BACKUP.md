# Backup — Agenda Pro

## Objetivo

Backup lógico diário (ou sob demanda) do PostgreSQL via `pg_dump` no container Compose. Redis é cache/fila — não é source of truth (outbox em `notification_jobs`).

## RPO / RTO propostos (MVP / beta)

| Métrica | Alvo sugerido | Notas |
|---------|---------------|--------|
| RPO | ≤ 24 h | Dump diário; reduzir com dump a cada 6 h se houver tenants pagantes |
| RTO | ≤ 2 h | Restore dump + migrate + smoke health |

Não há PITR (WAL archiving) nesta fase — documentado como próximo passo em `DISASTER-RECOVERY.md`.

## Backup (local / staging)

```powershell
# Dry-run (não escreve arquivo)
npm run db:backup:dry

# Backup real → ./backups/agenda-pro-YYYYMMDD-HHmmss.sql
npm run db:backup
```

Linux/macOS:

```bash
chmod +x scripts/backup-postgres.sh
./scripts/backup-postgres.sh --dry-run
./scripts/backup-postgres.sh
```

Compose prod:

```powershell
powershell -File .\scripts\backup-postgres.ps1 -ComposeFile docker-compose.prod.yml
```

`backups/` está no `.gitignore`.

## Restore (procedimento)

1. Subir Postgres saudável (`docker compose up -d postgres`).
2. **Dry-run** do script de restore.
3. Confirmar dump correto (data/tamanho).
4. Aplicar com confirmação explícita:

```powershell
powershell -File .\scripts\restore-postgres.ps1 -DumpFile backups\agenda-pro-XXXX.sql -DryRun
powershell -File .\scripts\restore-postgres.ps1 -DumpFile backups\agenda-pro-XXXX.sql -ConfirmRestore
```

5. `npm run db:migrate` se o dump for mais antigo que as migrations atuais.
6. Smoke: `GET /api/health` e `GET /api/health/ready`.

## Checklist pós-backup

- [ ] Arquivo não-vazio
- [ ] Cópia off-host (`BACKUP_OFFHOST_DIR` ou `-OffHostDir`) — **obrigatório para RPO contratado**
- [ ] Restore drill: `npm run db:restore:drill -- -DumpFile backups\...` (ou `-Apply` em DB descartável)
- [ ] Smoke `/api/health` + `/api/health/ready` após restore real

### Off-host

```powershell
$env:BACKUP_OFFHOST_DIR = 'D:\backups-agenda-pro'  # ou mount S3/rclone
npm run db:backup
```

Agendar no Windows Task Scheduler (diário) apontando para `scripts/backup-postgres.ps1`.

### Restore drill

```powershell
npm run db:restore:drill -- -DumpFile backups\agenda-pro-XXXX.sql
# Em staging descartável:
powershell -File .\scripts\restore-drill.ps1 -DumpFile backups\agenda-pro-XXXX.sql -Apply
```

## Monitoramento de readiness

```powershell
$env:HEALTH_READY_URL = 'https://api.seudominio.com/api/health/ready'
$env:HEALTH_ALERT_WEBHOOK_URL = 'https://hooks.slack.com/services/...'
npm run ops:watch-ready
```

Agendar a cada 1–5 min. Alternativa: UptimeRobot/Better Stack HTTP 200 em `/api/health/ready`.

## O que não está coberto

- PITR / WAL archiving (ver `DISASTER-RECOVERY.md`)
- Criptografia at-rest do dump (cifrar antes de upload cloud)
- Redis AOF/RDB (fila reconstruível via outbox)
- Upload S3 nativo (use `BACKUP_OFFHOST_DIR` + sync externo)