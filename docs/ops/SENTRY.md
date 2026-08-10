# Sentry — Agenda Pro (ops stub)

## Status

SDK **não** está instalado em `apps/api` / `apps/web` neste ciclo (fora do escopo DevOps — exige código de app).

Este doc + variáveis em `.env.example` / compose preparam o caminho. Alertas de uptime **já** cobrem `/api/health/ready` via:

- `scripts/watch-ready.ps1` (+ Task Scheduler)
- `.github/workflows/health-probe.yml` (cron 15 min + webhook)

## Variáveis (reservadas)

| Var | Onde | Nota |
|-----|------|------|
| `SENTRY_DSN` | API / worker | Server-side Nest |
| `SENTRY_ENVIRONMENT` | API / worker | `production` / `staging` |
| `NEXT_PUBLIC_SENTRY_DSN` | Web | Browser; **breaking** se exposto sem consentimento de privacidade |
| `SENTRY_AUTH_TOKEN` | CI (secret) | Só se houver upload de source maps |

Compose prod já interpola `SENTRY_DSN` / `SENTRY_ENVIRONMENT` (vazio = no-op até o SDK existir).

## Dependência de app (mínimo)

Quando Engineering/Frontend puder tocar apps:

1. API: `@sentry/nestjs` (ou `@sentry/node`) no bootstrap + `SENTRY_DSN`.
2. Web: `@sentry/nextjs` + `NEXT_PUBLIC_SENTRY_DSN`.
3. Sample rate baixo (ex. 0.1) em produção; redigir PII alinhado ao Pino.

Até lá: **não** tratar ausência de Sentry como falha de deploy.

## Alerta “real” hoje

1. Repo → Settings → Secrets: `HEALTH_ALERT_WEBHOOK_URL` (Slack/Discord).
2. Vars: `HEALTH_READY_URL=https://seu-dominio/api/health/ready`.
3. Workflow `Health probe` falha o job e posta no webhook se status ≠ 200.
