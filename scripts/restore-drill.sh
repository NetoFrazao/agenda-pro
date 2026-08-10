#!/usr/bin/env bash
# Restore drill (não destrutivo por padrão): valida dump + dry-run.
# Uso: ./scripts/restore-drill.sh --dump-file backups/agenda-pro-XXXX.sql
#      ./scripts/restore-drill.sh --dump-file ... --apply  # destrutivo

set -euo pipefail
cd "$(dirname "$0")/.."

DUMP=""
APPLY=0
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dump-file) DUMP="$2"; shift 2 ;;
    --apply) APPLY=1; shift ;;
    --compose-file) COMPOSE_FILE="$2"; shift 2 ;;
    *) echo "Arg desconhecido: $1" >&2; exit 2 ;;
  esac
done

if [[ -z "$DUMP" || ! -f "$DUMP" ]]; then
  echo "Dump não encontrado: ${DUMP:-<vazio>}" >&2
  exit 1
fi

BYTES="$(wc -c < "$DUMP" | tr -d ' ')"
echo "==> Dump: ${DUMP} (${BYTES} bytes)"
if [[ "${BYTES}" -lt 100 ]]; then
  echo "Dump suspeitamente pequeno — abortando." >&2
  exit 1
fi

if ! head -n 5 "$DUMP" | grep -Eqi 'PostgreSQL|CREATE|SET'; then
  echo "Aviso: conteúdo não parece pg_dump plain." >&2
fi

echo "==> Dry-run restore"
./scripts/restore-postgres.sh --dump-file "$DUMP" --dry-run --compose-file "$COMPOSE_FILE"

if [[ "$APPLY" -eq 0 ]]; then
  echo "OK drill (validação + dry-run). Para aplicar: --apply"
  exit 0
fi

echo "==> APPLY restore (destrutivo)"
./scripts/restore-postgres.sh --dump-file "$DUMP" --confirm --compose-file "$COMPOSE_FILE"
