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
- [ ] Cópia off-host (S3/Backblaze/outro) — *manual nesta fase*
- [ ] Restore testado em ambiente descartável ao menos 1×/mês

## O que não está coberto

- Backup automático em Railway/Render (usar snapshots do provedor + este script como fallback)
- Criptografia at-rest do arquivo local (cifrar antes de upload off-host)
- Redis AOF/RDB (opcional; fila é reconstruível a partir do outbox — ver request Engineering M-06)
