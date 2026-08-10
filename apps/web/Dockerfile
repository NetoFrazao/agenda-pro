# syntax=docker/dockerfile:1
# Multi-stage Web (Next.js standalone) — non-root.
# Build (raiz do repo): docker build -f apps/web/Dockerfile -t agenda-pro-web .
# Requer output: 'standalone' em next.config.ts.
# Base pin: node:20-alpine multi-arch index (hub, 2026-04-15).

ARG NODE_IMAGE=node:20-alpine@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293

FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
RUN npm ci --workspace=@agenda-pro/web --include-workspace-root

FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json /app/package-lock.json ./
COPY --from=deps /app/apps/web/package.json ./apps/web/
COPY --from=deps /app/packages/shared/package.json ./packages/shared/
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web
ARG NEXT_PUBLIC_API_URL=http://localhost:3001
ARG NEXT_PUBLIC_APP_URL=http://localhost:3000
ARG NEXT_PUBLIC_SENTRY_DSN=
ARG SENTRY_AUTH_TOKEN=
ARG SENTRY_ORG=
ARG SENTRY_PROJECT=
ARG SENTRY_ENVIRONMENT=production
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN \
    SENTRY_AUTH_TOKEN=$SENTRY_AUTH_TOKEN \
    SENTRY_ORG=$SENTRY_ORG \
    SENTRY_PROJECT=$SENTRY_PROJECT \
    SENTRY_ENVIRONMENT=$SENTRY_ENVIRONMENT \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build -w @agenda-pro/shared && npm run build -w @agenda-pro/web

FROM ${NODE_IMAGE} AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN apk add --no-cache wget \
  && addgroup -S app && adduser -S app -G app

COPY --from=build --chown=app:app /app/apps/web/public ./apps/web/public
COPY --from=build --chown=app:app /app/apps/web/.next/standalone ./
COPY --from=build --chown=app:app /app/apps/web/.next/static ./apps/web/.next/static

USER app
EXPOSE 3000
HEALTHCHECK --interval=20s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/ || exit 1

CMD ["node", "apps/web/server.js"]
