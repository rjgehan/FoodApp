#!/usr/bin/env bash
# One-command dev environment control: Postgres + Redis (Docker), the Spring Boot
# backend, and the Vite frontend. Logs go to .dev/*.log; nothing is tracked in git.
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$ROOT_DIR/.dev"
mkdir -p "$LOG_DIR"

BACKEND_PORT=8080
WEB_PORT=5173
COMPOSE_FILE="$ROOT_DIR/docker-compose.dev.yml"

lan_ip() {
  ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true
}

wait_for_http() {
  local url="$1" name="$2" tries="${3:-60}"
  for ((i = 0; i < tries; i++)); do
    code=$(curl -s -o /dev/null -w '%{http_code}' "$url" 2>/dev/null || echo "000")
    if [[ "$code" != "000" ]]; then
      return 0
    fi
    sleep 1
  done
  echo "Timed out waiting for $name at $url" >&2
  return 1
}

wait_for_docker() {
  if docker info >/dev/null 2>&1; then
    return 0
  fi
  echo "Docker isn't running — launching Docker Desktop..."
  open -a Docker
  for ((i = 0; i < 60; i++)); do
    docker info >/dev/null 2>&1 && return 0
    sleep 2
  done
  echo "Docker didn't come up in time. Start Docker Desktop manually and re-run this script." >&2
  return 1
}

start() {
  wait_for_docker || exit 1

  echo "Starting Postgres + Redis..."
  docker compose -f "$COMPOSE_FILE" up -d

  local pg_cid
  pg_cid=$(docker compose -f "$COMPOSE_FILE" ps -q postgres)
  echo "Waiting for Postgres..."
  for ((i = 0; i < 30; i++)); do
    docker exec "$pg_cid" pg_isready -U mealplanner >/dev/null 2>&1 && break
    sleep 1
  done

  if lsof -ti:$BACKEND_PORT >/dev/null 2>&1; then
    echo "Backend already running on :$BACKEND_PORT"
  else
    echo "Starting backend..."
    (cd "$ROOT_DIR/backend" && nohup ./mvnw spring-boot:run >"$LOG_DIR/backend.log" 2>&1 &)
    wait_for_http "http://localhost:$BACKEND_PORT/actuator/health" "backend" 90 || {
      echo "Backend failed to start — check $LOG_DIR/backend.log"
      exit 1
    }
  fi
  echo "Backend up:  http://localhost:$BACKEND_PORT"

  if lsof -ti:$WEB_PORT >/dev/null 2>&1; then
    echo "Frontend already running on :$WEB_PORT"
  else
    echo "Starting frontend..."
    (cd "$ROOT_DIR/web" && nohup npm run dev >"$LOG_DIR/web.log" 2>&1 &)
    wait_for_http "http://localhost:$WEB_PORT" "frontend" 30 || {
      echo "Frontend failed to start — check $LOG_DIR/web.log"
      exit 1
    }
  fi
  echo "Frontend up: http://localhost:$WEB_PORT"

  local ip
  ip=$(lan_ip)
  echo ""
  echo "Ready."
  echo "  This machine:  http://localhost:$WEB_PORT"
  [[ -n "$ip" ]] && echo "  Other devices: http://$ip:$WEB_PORT"
}

stop() {
  echo "Stopping frontend..."
  lsof -ti:$WEB_PORT | xargs -r kill 2>/dev/null

  echo "Stopping backend..."
  lsof -ti:$BACKEND_PORT | xargs -r kill 2>/dev/null

  echo "Stopping Postgres + Redis..."
  docker compose -f "$COMPOSE_FILE" stop

  echo "Stopped."
}

status() {
  echo "Postgres + Redis:"
  docker compose -f "$COMPOSE_FILE" ps
  echo ""
  if lsof -ti:$BACKEND_PORT >/dev/null 2>&1; then
    echo "Backend:  running on :$BACKEND_PORT"
  else
    echo "Backend:  stopped"
  fi
  if lsof -ti:$WEB_PORT >/dev/null 2>&1; then
    echo "Frontend: running on :$WEB_PORT"
  else
    echo "Frontend: stopped"
  fi
}

case "${1:-}" in
  start) start ;;
  stop) stop ;;
  restart)
    stop
    start
    ;;
  status) status ;;
  *)
    echo "Usage: $0 {start|stop|restart|status}"
    exit 1
    ;;
esac
