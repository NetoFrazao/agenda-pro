#!/usr/bin/env bash
# Entrypoint para cron: backup + alerta em falha + opcional restore drill dry.
# Crontab exemplo (diário 03:15 UTC):
#   15 3 * * * cd /opt/agenda-pro && ./scripts/backup-scheduled.sh >> /var/log/agenda-pro-backup.log 2>&1
#
# Env: COMPOSE_FILE, BACKUP_OFFHOST_DIR, BACKUP_ALERT_WEBHOOK_URL, RUN_RESTORE_DRILL=1

set -euo pipefail
cd "$(dirname "$0")/.."

HOOK="${BACKUP_ALERT_WEBHOOK_URL:-${HEALTH_ALERT_WEBHOOK_URL:-}}"

notify() {
  local msg="$1"
  echo "$(date -Is) $msg"
  if [[ -n "$HOOK" ]]; then
    curl -fsS -X POST -H 'Content-Type: application/json' \
      -d "{\"text\":$(printf '%s' "$msg" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')}" \
      "$HOOK" >/dev/null 2>&1 || true
  fi
}

if ! ./scripts/backup-postgres.sh; then
  notify "[Agenda Pro] backup-scheduled FALHOU"
  exit 1
fi

LATEST="$(ls -1t backups/agenda-pro-*.sql 2>/dev/null | head -1 || true)"
if [[ -z "${LATEST}" ]]; then
  notify "[Agenda Pro] backup-scheduled: nenhum dump em backups/"
  exit 1
fi

if [[ "${RUN_RESTORE_DRILL:-0}" == "1" ]]; then
  if ! ./scripts/restore-drill.sh --dump-file "${LATEST}"; then
    notify "[Agenda Pro] restore-drill FALHOU após backup (${LATEST})"
    exit 1
  fi
fi

echo "$(date -Is) OK backup-scheduled (${LATEST})"
