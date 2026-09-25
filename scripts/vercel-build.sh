#!/usr/bin/env bash
# Build para Vercel: aplica migraciones, carga datos iniciales y compila.
# Acepta DATABASE_URL o POSTGRES_PRISMA_URL (integración Supabase de Vercel).
# Las migraciones necesitan una conexión directa/de sesión: se usa DIRECT_URL o POSTGRES_URL_NON_POOLING
# y, si no existen, se deriva del pooler de Supabase (puerto 6543 → 5432, sin pgbouncer).
set -euo pipefail

export DATABASE_URL="${DATABASE_URL:-${POSTGRES_PRISMA_URL:-}}"
if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: falta DATABASE_URL. Agréguela en Vercel → Settings → Environment Variables (ver README, sección Vercel)." >&2
  exit 1
fi

MIGRATE_URL="${DIRECT_URL:-${POSTGRES_URL_NON_POOLING:-}}"
if [ -z "$MIGRATE_URL" ]; then
  MIGRATE_URL=$(node -e '
    const u = new URL(process.env.DATABASE_URL);
    if (u.port === "6543") u.port = "5432";
    for (const k of ["pgbouncer", "connection_limit"]) u.searchParams.delete(k);
    process.stdout.write(u.toString());
  ')
fi
echo "Migraciones vía puerto $(node -e 'process.stdout.write(new URL(process.argv[1]).port || "5432")' "$MIGRATE_URL")"

DATABASE_URL="$MIGRATE_URL" npx prisma migrate deploy
DATABASE_URL="$MIGRATE_URL" npx tsx prisma/seed.ts
npx next build
