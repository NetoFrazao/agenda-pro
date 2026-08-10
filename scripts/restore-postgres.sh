#!/usr/bin/env bash
# Restore Postgres a partir de dump plain (pg_dump).
# Uso:
#   ./scripts/restore-postgres.sh --dump-file backups/x.sql --dry-run
#   ./scripts/restore-postgres.sh --dump-file backups/x.sql --confirm

set -euo pipefail
cd "$(dirname "$0")/.."

DUMP=""
DRY_RUN=0
CONFIRM=0
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
SERVICE="${POSTGRES_SERVICE:-postgres}"
USER_NAME="${POSTGRES_USER:-agenda}"
DB_NAME="${POSTGRES_DB:-agenda_pro}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dump-file) DUMP="$2"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    --confirm) CONFIRM=1; shift ;;
    --compose-file) COMPOSE_FILE="$2"; shift 2 ;;
    *) echo "Arg desconhecido: $1" >&2; exit 2 ;;
  esac
done

if [[ -z "$DUMP" || ! -f "$DUMP" ]]; then
  echo "Dump não encontrado: ${DUMP:-<vazio>}" >&2
  exit 1
fi

echo "==> Compose: ${COMPOSE_FILE}  service: ${SERVICE}  db: ${DB_NAME}"
echo "==> Dump: ${DUMP}"

CMD=(docker compose -f "${COMPOSE_FILE}" exec -T "${SERVICE}"
  psql -U "${USER_NAME}" -d "${DB_NAME}" -v ON_ERROR_STOP=1)

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "[dry-run] cat ${DUMP} | ${CMD[*]}"
  exit 0
fi

if [[ "$CONFIRM" -ne 1 ]]; then
  echo "Recuse: passe --confirm para aplicar (destrutivo)." >&2
  exit 2
fi

cat "${DUMP}" | "${CMD[@]}"
echo "OK restore aplicado."
