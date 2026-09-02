#!/usr/bin/env bash
# Pull the images GitHub Actions built and restart the stack. Run this on the server.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"
COMPOSE=(docker compose -f docker-compose.prod.yml)

if [[ ! -f .env ]]; then
  echo "No .env here. Copy the template and fill it in first:" >&2
  echo "  cp .env.prod.example .env && \$EDITOR .env" >&2
  exit 1
fi

echo "Pulling images..."
"${COMPOSE[@]}" pull

echo "Starting..."
"${COMPOSE[@]}" up -d --remove-orphans

echo "Waiting for the API..."
for _ in $(seq 1 60); do
  if curl -fsS "http://localhost:${BACKEND_PORT:-8080}/actuator/health" >/dev/null 2>&1; then
    echo "Healthy."
    "${COMPOSE[@]}" ps
    exit 0
  fi
  sleep 2
done

echo "The API didn't come up. Recent logs:" >&2
"${COMPOSE[@]}" logs --tail=40 backend >&2
exit 1
