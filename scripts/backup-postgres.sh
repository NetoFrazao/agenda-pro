#!/usr/bin/env bash
# Backup lógico do Postgres (pg_dump via container Docker) + off-host + alerta.
# Uso (raiz): ./scripts/backup-postgres.sh [--dry-run]
# Agendado: ./scripts/backup-scheduled.sh (cron) ou install-backup-cron.sh
# Restore: ver BACKUP.md / DISASTER-RECOVERY.md

set -euo pipefail
cd "$(dirname "$0")/.."

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
SERVICE="${POSTGRES_SERVICE:-postgres}"
USER_NAME="${POSTGRES_USER:-agenda}"
DB_NAME="${POSTGRES_DB:-agenda_pro}"
OUT_DIR="${BACKUP_DIR:-backups}"
OFFHOST="${BACKUP_OFFHOST_DIR:-}"
HOOK="${BACKUP_ALERT_WEBHOOK_URL:-${HEALTH_ALERT_WEBHOOK_URL:-}}"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT_FILE="${OUT_DIR}/agenda-pro-${STAMP}.sql"
DRY_RUN=0

alert() {
  local msg="$1"
  echo "$msg" >&2
  if [[ -n "$HOOK" ]]; then
    curl -fsS -X POST -H 'Content-Type: application/json' \
      -d "{\"text\":$(printf '%s' "$msg" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')}" \
      "$HOOK" >/dev/null 2>&1 || echo "Aviso: falha ao postar alerta" >&2
  fi
}

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    *) echo "Arg desconhecido: $arg" >&2; exit 2 ;;
  esac
done

echo "==> Compose: ${COMPOSE_FILE}  service: ${SERVICE}  db: ${DB_NAME}"
echo "==> Destino: ${OUT_FILE}"
[[ -n "$OFFHOST" ]] && echo "==> Off-host: ${OFFHOST}"

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "[dry-run] docker compose -f ${COMPOSE_FILE} exec -T ${SERVICE} pg_dump -U ${USER_NAME} -d ${DB_NAME} --no-owner --format=plain > ${OUT_FILE}"
  [[ -n "$OFFHOST" ]] && echo "[dry-run] cp ${OUT_FILE} ${OFFHOST}/"
  echo "[dry-run] nenhum arquivo escrito."
  exit 0
fi

mkdir -p "${OUT_DIR}"

if ! docker compose -f "${COMPOSE_FILE}" exec -T "${SERVICE}" \
  pg_dump -U "${USER_NAME}" -d "${DB_NAME}" --no-owner --format=plain \
  > "${OUT_FILE}"; then
  alert "[Agenda Pro] BACKUP FALHOU pg_dump (${COMPOSE_FILE})"
  exit 1
fi

BYTES="$(wc -c < "${OUT_FILE}" | tr -d ' ')"
if [[ "${BYTES}" -lt 100 ]]; then
  alert "[Agenda Pro] BACKUP FALHOU dump suspeito (${BYTES} bytes)"
  exit 1
fi

echo "OK backup: ${OUT_FILE} (${BYTES} bytes)"

if [[ -n "$OFFHOST" ]]; then
  mkdir -p "${OFFHOST}"
  cp "${OUT_FILE}" "${OFFHOST}/"
  echo "OK off-host: ${OFFHOST}/$(basename "${OUT_FILE}")"
else
  echo "Aviso: BACKUP_OFFHOST_DIR não definido — RPO local only."
fi

echo "Restore: ver BACKUP.md"
