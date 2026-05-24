# syntax=docker/dockerfile:1

# ── dev ───────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS dev
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
RUN pnpm install --frozen-lockfile
COPY . .
EXPOSE 3000
CMD ["pnpm", "--filter", "api", "start:dev"]

# ── builder ───────────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter api build
# Produce a self-contained node_modules for the api package only
RUN pnpm --filter api deploy --prod /deploy

# ── prod ──────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS prod
WORKDIR /app
ENV NODE_ENV=production
# Runtime deps from pnpm deploy (no dev deps, no workspace symlinks)
COPY --from=builder /deploy/node_modules ./node_modules
# Compiled application
COPY --from=builder /app/apps/api/dist ./dist
# Drizzle migration SQL files (needed when RUN_MIGRATIONS_ON_BOOT=true)
COPY --from=builder /app/apps/api/drizzle ./drizzle
COPY --from=builder /app/apps/api/package.json ./package.json
USER node
EXPOSE 3000
CMD ["node", "dist/src/main"]
