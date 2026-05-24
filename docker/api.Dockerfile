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

# ── prod ──────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS prod
WORKDIR /app
ENV NODE_ENV=production
# Install ONLY the API's production deps with plain npm — no pnpm workspace,
# no Next.js, no platform-specific native binaries from other workspace members.
# Results in ~40MB node_modules instead of 693MB.
COPY apps/api/package.json ./package.json
RUN npm install --omit=dev --ignore-scripts
# Compiled application and Drizzle migration files
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/drizzle ./drizzle
USER node
EXPOSE 3000
CMD ["node", "dist/src/main"]
