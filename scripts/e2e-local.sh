#!/usr/bin/env bash
# Crea una base de datos desechable para E2E, la migra y siembra, levanta la app y corre Playwright.
set -euo pipefail
DB=${E2E_DB:-compras_e2e}
PGURL=${E2E_PG:-postgresql://compras@localhost:5432}
psql "$PGURL/postgres" -qc "DROP DATABASE IF EXISTS $DB WITH (FORCE)" -qc "CREATE DATABASE $DB"
export DATABASE_URL="$PGURL/$DB"
export DIRECT_URL="$DATABASE_URL"
export UPLOAD_DIR="${UPLOAD_DIR:-./data/e2e-uploads}"
npx prisma migrate deploy >/dev/null
npx tsx prisma/seed.ts
[ -n "${SKIP_BUILD:-}" ] || npx next build >/dev/null
PORT=${E2E_PORT:-3100}
node node_modules/next/dist/bin/next start -p "$PORT" > "${E2E_LOG:-/tmp/compras-e2e.log}" 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null; pkill -f "dist/bin/next start -p $PORT" 2>/dev/null || true' EXIT
for i in $(seq 1 30); do curl -sf "http://localhost:$PORT/login" >/dev/null && break; sleep 1; done
E2E_BASE_URL="http://localhost:$PORT" npx playwright test "$@"
