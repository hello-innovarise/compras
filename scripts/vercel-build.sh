#!/usr/bin/env bash
# Build para Vercel: acepta DATABASE_URL/DIRECT_URL o las variables de la integración Supabase de Vercel
# (POSTGRES_PRISMA_URL / POSTGRES_URL_NON_POOLING), aplica migraciones, carga datos iniciales y compila.
set -euo pipefail

export DATABASE_URL="${DATABASE_URL:-${POSTGRES_PRISMA_URL:-}}"
export DIRECT_URL="${DIRECT_URL:-${POSTGRES_URL_NON_POOLING:-$DATABASE_URL}}"

if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: falta DATABASE_URL. Agréguela en Vercel → Settings → Environment Variables (ver README, sección Vercel)." >&2
  exit 1
fi
if [[ "$DIRECT_URL" == *":6543"* ]]; then
  echo "AVISO: DIRECT_URL apunta al pooler de transacciones (puerto 6543). Para migraciones use la conexión del puerto 5432 (Session pooler de Supabase)." >&2
fi

npx prisma migrate deploy
npx tsx prisma/seed.ts
npx next build
