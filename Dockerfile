# Compras AG – imagen única para app web y worker
FROM node:22-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS build
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx prisma generate && npx next build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app /app
RUN mkdir -p /data/uploads
EXPOSE 3000
# Aplica migraciones pendientes y arranca la app
CMD ["sh", "-c", "npx prisma migrate deploy && npx next start -p 3000"]
