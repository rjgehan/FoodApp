#!/usr/bin/env bash
# Wipes the LOCAL dev database and restarts the backend on the fresh schema, with the
# integration API switched on so its tests can run. Only ever touches the docker-compose.dev.yml
# Postgres on this machine — there is no way to point it anywhere else.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE="$ROOT/docker-compose.dev.yml"
LOG="$ROOT/.dev/backend.log"
KEY="${INTEGRATION_API_KEY:-e2e-integration-key}"

if [[ "${1:-}" != "--yes" ]]; then
  read -r -p "This deletes everything in the LOCAL dev database. Continue? [y/N] " answer
  [[ "$answer" =~ ^[Yy]$ ]] || { echo "Left it alone."; exit 1; }
fi

docker compose -f "$COMPOSE" up -d >/dev/null 2>&1
PG=$(docker compose -f "$COMPOSE" ps -q postgres)
REDIS=$(docker compose -f "$COMPOSE" ps -q redis)

echo "Stopping backend..."
lsof -ti:8080 -sTCP:LISTEN | xargs -r kill 2>/dev/null || true
for _ in $(seq 1 20); do lsof -ti:8080 -sTCP:LISTEN >/dev/null || break; sleep 0.5; done

echo "Wiping schema..."
docker exec "$PG" psql -q -U mealplanner -d mealplanner -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;" 2>/dev/null
docker exec "$REDIS" redis-cli FLUSHALL >/dev/null

echo "Starting backend (integration key: $KEY)..."
mkdir -p "$ROOT/.dev"
(
  cd "$ROOT/backend"
  if [[ -f "$ROOT/.env" ]]; then set -a; source "$ROOT/.env"; set +a; fi
  # Tests must never spend the real Gemini quota.
  export GEMINI_API_KEY=""
  export INTEGRATION_API_KEY="$KEY"
  nohup ./mvnw -q spring-boot:run >"$LOG" 2>&1 &
)
for _ in $(seq 1 120); do
  curl -sf http://localhost:8080/actuator/health >/dev/null && break
  sleep 1
done
curl -sf http://localhost:8080/actuator/health >/dev/null || { echo "Backend did not come up — see $LOG"; exit 1; }

if ! lsof -ti:5173 -sTCP:LISTEN >/dev/null; then
  echo "Starting frontend..."
  (cd "$ROOT/web" && nohup npm run dev >"$ROOT/.dev/web.log" 2>&1 &)
  for _ in $(seq 1 30); do curl -sf http://localhost:5173 >/dev/null && break; sleep 1; done
fi

echo "Ready: empty database, backend on :8080, web on :5173."
