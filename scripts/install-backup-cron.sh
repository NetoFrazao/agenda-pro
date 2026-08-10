#!/usr/bin/env bash
# Instala crontab diário para backup-scheduled.sh (Linux).
# Uso: ./scripts/install-backup-cron.sh [--dry-run]
#      CRON_SCHEDULE='15 3 * * *' BACKUP_OFFHOST_DIR=/mnt/offhost ./scripts/install-backup-cron.sh

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCHEDULE="${CRON_SCHEDULE:-15 3 * * *}"
MARKER="# agenda-pro-backup"
LINE="${SCHEDULE} cd ${ROOT} && ./scripts/backup-scheduled.sh >> ${ROOT}/backups/cron.log 2>&1 ${MARKER}"
DRY_RUN=0
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=1

echo "==> Schedule: ${SCHEDULE}"
echo "==> Line: ${LINE}"

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "[dry-run] crontab não alterado"
  exit 0
fi

TMP="$(mktemp)"
crontab -l 2>/dev/null | grep -v "${MARKER}" >"${TMP}" || true
echo "${LINE}" >>"${TMP}"
crontab "${TMP}"
rm -f "${TMP}"
echo "OK crontab instalado. Verifique: crontab -l | grep agenda-pro"
