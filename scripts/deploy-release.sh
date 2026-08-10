#!/usr/bin/env bash
# Deploy reproduzível no host: pull imagens GHCR → migrate deploy → compose up.
# Uso (no servidor, raiz do clone):
#   export API_IMAGE=ghcr.io/org/agenda-pro-api:sha-abc1234
#   export WEB_IMAGE=ghcr.io/org/agenda-pro-web:sha-abc1234
#   ./scripts/deploy-release.sh
#   ./scripts/deploy-release.sh --dry-run
#
# Migrate: one-shot node:20 + prisma CLI (runtime image prune omit=dev não traz prisma).
# Espera: docker-compose.prod.yml (+ opcional TLS via COMPOSE_FILES), .env, Docker logado no GHCR.

set -euo pipefail

DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --remote-stdin) ;; # no-op (compat)
    *) echo "Arg desconhecido: $arg" >&2; exit 2 ;;
  esac
done

ROOT="${DEPLOY_PATH:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$ROOT"

COMPOSE_FILES="${COMPOSE_FILES:-docker-compose.prod.yml}"
IFS=':' read -ra CF_ARR <<< "$COMPOSE_FILES"
COMPOSE_ARGS=()
for f in "${CF_ARR[@]}"; do
  COMPOSE_ARGS+=(-f "$f")
done

API_IMAGE="${API_IMAGE:-}"
WEB_IMAGE="${WEB_IMAGE:-}"
PRISMA_MIGRATE_IMAGE="${PRISMA_MIGRATE_IMAGE:-node:20-alpine}"

echo "==> Root: $ROOT"
echo "==> Compose: ${COMPOSE_FILES}"
echo "==> API_IMAGE=${API_IMAGE:-<unset>}"
echo "==> WEB_IMAGE=${WEB_IMAGE:-<unset>}"

run() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "[dry-run] $*"
  else
    "$@"
  fi
}

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "[dry-run] docker pull \$API_IMAGE && docker pull \$WEB_IMAGE"
  echo "[dry-run] docker tag → agenda-pro-api:release / agenda-pro-web:release"
  echo "[dry-run] docker compose ${COMPOSE_ARGS[*]} --env-file .env up -d postgres redis"
  echo "[dry-run] docker run --rm --network <compose> $PRISMA_MIGRATE_IMAGE npx prisma migrate deploy"
  echo "[dry-run] docker compose ${COMPOSE_ARGS[*]} --env-file .env up -d --no-build"
  echo "OK deploy-release dry-run"
  exit 0
fi

: "${API_IMAGE:?Set API_IMAGE (ex: ghcr.io/org/agenda-pro-api:sha-…)}"
: "${WEB_IMAGE:?Set WEB_IMAGE}"

export API_IMAGE WEB_IMAGE

docker pull "$API_IMAGE"
docker pull "$WEB_IMAGE"
docker tag "$API_IMAGE" agenda-pro-api:release
docker tag "$WEB_IMAGE" agenda-pro-web:release

docker compose "${COMPOSE_ARGS[@]}" --env-file .env up -d postgres redis

DATABASE_URL="$(
  docker compose "${COMPOSE_ARGS[@]}" --env-file .env config \
    | awk '/^  api:/,/^  [a-z]/ { if ($1=="DATABASE_URL:") { print $2; exit } }'
)"
if [[ -z "${DATABASE_URL}" ]]; then
  echo "FAIL: não foi possível ler DATABASE_URL do compose config" >&2
  exit 1
fi
PG_CID="$(docker compose "${COMPOSE_ARGS[@]}" --env-file .env ps -q postgres)"
NETWORK="$(docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}' "$PG_CID" | awk '{print $1}')"
echo "==> migrate deploy (network=$NETWORK)"
docker run --rm \
  --network "$NETWORK" \
  -e DATABASE_URL="$DATABASE_URL" \
  -v "$ROOT/apps/api/prisma:/prisma:ro" \
  "$PRISMA_MIGRATE_IMAGE" \
  sh -c "npx --yes prisma@6 migrate deploy --schema /prisma/schema.prisma"

docker compose "${COMPOSE_ARGS[@]}" --env-file .env up -d --no-build

echo "OK deploy-release. Smoke: curl -fsS \"\${API_PUBLIC_URL%/}/api/health/ready\" (ou via TLS_DOMAIN)"