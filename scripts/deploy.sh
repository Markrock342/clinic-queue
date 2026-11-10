#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

health_check() {
  local url="${1:-http://127.0.0.1:3000/api/health}"
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    if curl -fsS "$url" >/dev/null; then
      echo "พร้อมใช้งานที่ http://127.0.0.1:3000"
      return 0
    fi
    sleep 1
  done
  echo "เปิดบริการไม่สำเร็จ" >&2
  return 1
}

if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  if docker compose version >/dev/null 2>&1; then
    docker compose up -d --build
  else
    docker build -t clinic-queue:latest .
    docker rm -f clinic-queue >/dev/null 2>&1 || true
    docker run -d --name clinic-queue -p 3000:3000 --restart unless-stopped clinic-queue:latest
  fi
  health_check
  exit 0
fi

DEPLOY_DIR="${DEPLOY_DIR:-$HOME/clinic-queue-deploy}"
mkdir -p "$DEPLOY_DIR"
cp -R "$ROOT/src" "$ROOT/public" "$ROOT/package.json" "$ROOT/package-lock.json" "$DEPLOY_DIR/"
cd "$DEPLOY_DIR"
npm ci --omit=dev

if [[ -f app.pid ]]; then
  old="$(cat app.pid || true)"
  if [[ -n "${old}" ]] && kill -0 "$old" 2>/dev/null; then
    kill "$old" || true
    sleep 1
  fi
fi

PORT="${PORT:-3000}" nohup node src/server.js > app.log 2>&1 &
echo $! > app.pid
health_check
