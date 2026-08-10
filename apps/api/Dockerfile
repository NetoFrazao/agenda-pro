# syntax=docker/dockerfile:1
# Multi-stage API image — build no monorepo, runtime non-root.
# Build (raiz do repo): docker build -f apps/api/Dockerfile -t agenda-pro-api .
# Base pin: node:20-alpine multi-arch index (hub, 2026-04-15).

ARG NODE_IMAGE=node:20-alpine@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293

FROM ${NODE_IMAGE} AS deps
WORKDIR /app
RUN apk add --no-cache openssl
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
RUN npm ci

FROM ${NODE_IMAGE} AS build
WORKDIR /app
RUN apk add --no-cache openssl
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json /app/package-lock.json ./
COPY --from=deps /app/apps/api/package.json ./apps/api/
COPY --from=deps /app/packages/shared/package.json ./packages/shared/
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
RUN npm run build -w @agenda-pro/shared \
  && npx prisma generate --schema apps/api/prisma/schema.prisma \
  && npm run build -w @agenda-pro/api \
  && npm prune --omit=dev

FROM ${NODE_IMAGE} AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache openssl wget \
  && addgroup -S app && adduser -S app -G app

COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/package.json ./
COPY --from=build --chown=app:app /app/apps/api/package.json ./apps/api/
COPY --from=build --chown=app:app /app/packages/shared ./packages/shared
COPY --from=build --chown=app:app /app/apps/api/dist ./apps/api/dist
COPY --from=build --chown=app:app /app/apps/api/prisma ./apps/api/prisma

USER app
EXPOSE 3001
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3001/api/health/ready || exit 1

CMD ["node", "apps/api/dist/main.js"]
