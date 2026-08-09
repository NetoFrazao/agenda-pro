#!/usr/bin/env bash
# Backup lógico do Postgres (pg_dump via container Docker).
# Uso (raiz): ./scripts/backup-postgres.sh [--dry-run]
# Restore: ver BACKUP.md / DISASTER-RECOVERY.md

set -euo pipefail
cd "$(dirname "$0")/.."

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
SERVICE="${POSTGRES_SERVICE:-postgres}"
USER_NAME="${POSTGRES_USER:-agenda}"
DB_NAME="${POSTGRES_DB:-agenda_pro}"
OUT_DIR="${BACKUP_DIR:-backups}"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT_FILE="${OUT_DIR}/agenda-pro-${STAMP}.sql"
DRY_RUN=0

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    *) echo "Arg desconhecido: $arg" >&2; exit 2 ;;
  esac
done

echo "==> Compose: ${COMPOSE_FILE}  service: ${SERVICE}  db: ${DB_NAME}"
echo "==> Destino: ${OUT_FILE}"

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "[dry-run] docker compose -f ${COMPOSE_FILE} exec -T ${SERVICE} pg_dump -U ${USER_NAME} -d ${DB_NAME} --no-owner --format=plain > ${OUT_FILE}"
  echo "[dry-run] nenhum arquivo escrito."
  exit 0
fi

mkdir -p "${OUT_DIR}"
docker compose -f "${COMPOSE_FILE}" exec -T "${SERVICE}" \
  pg_dump -U "${USER_NAME}" -d "${DB_NAME}" --no-owner --format=plain \
  > "${OUT_FILE}"

echo "OK backup: ${OUT_FILE} ($(wc -c < "${OUT_FILE}") bytes)"
echo "Restore: ver BACKUP.md"
