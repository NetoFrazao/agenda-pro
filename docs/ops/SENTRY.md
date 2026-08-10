# Sentry — Agenda Pro

## Status

SDK **instalado** em `apps/api` (`@sentry/nestjs`) e `apps/web` (`@sentry/nextjs`).
Sem DSN: **fail-soft** — o processo sobe normalmente e não envia eventos.

Alertas de uptime continuam cobrindo `/api/health/ready` via:

- `scripts/watch-ready.ps1` (+ Task Scheduler)
- `.github/workflows/health-probe.yml` (cron 15 min + webhook)

## Ativar

1. Crie projetos no [Sentry](https://sentry.io/) (um para API Node, um para Next.js — ou um só se preferir).
2. Preencha no host / `.env` / secrets do GitHub:

| Var | Onde | Nota |
|-----|------|------|
| `SENTRY_DSN` | API / worker (runtime) | Server-side Nest |
| `SENTRY_ENVIRONMENT` | API / worker / build Web | Ex.: `production` |
| `NEXT_PUBLIC_SENTRY_DSN` | Web (build + browser) | Público no bundle; alinhar privacidade/LGPD |
| `SENTRY_AUTH_TOKEN` | CI/CD (secret) | Upload de source maps no build Web |
| `SENTRY_ORG` / `SENTRY_PROJECT` | CI/CD (vars) | Slugs da org/projeto Sentry |

3. Compose prod já interpola `SENTRY_DSN` / `SENTRY_ENVIRONMENT` para API/worker.
4. Redeploy (ou `docker compose … up -d --build`).

### Source maps (Web)

No workflow CD (`.github/workflows/cd.yml`), o build da imagem Web recebe `SENTRY_AUTH_TOKEN`, `SENTRY_ORG` e `SENTRY_PROJECT` quando configurados.
Sem token, o build **não falha** — `next.config` desliga upload (`sourcemaps.disable`).

Para upload local: `SENTRY_AUTH_TOKEN=… SENTRY_ORG=… SENTRY_PROJECT=… npm run build -w @agenda-pro/web`.

## Comportamento no código

- **API:** `apps/api/src/instrument.ts` (importado em `main.ts` / `worker.ts`) + `SentryModule` + `@SentryExceptionCaptured` no filtro global.
- **Web:** `instrumentation.ts` / `instrumentation-client.ts`, configs server/edge, `global-error.tsx`, `withSentryConfig`.
- Sample rate de traces: `0.1` em production, `1.0` fora.
- `sendDefaultPii: false` (sem PII default).

## Alerta ready (sem Sentry)

1. Repo → Settings → Secrets: `HEALTH_ALERT_WEBHOOK_URL`.
2. Vars: `HEALTH_READY_URL=https://seu-dominio/api/health/ready`.
3. Workflow `Health probe` falha o job e posta no webhook se status ≠ 200.

## CI — scan de imagens

Jobs `docker-api` / `docker-web` rodam **Trivy** (`CRITICAL,HIGH`, `ignore-unfixed`) após o build.
Imagens base `node:20-alpine` estão pinadas por digest nos Dockerfiles.
