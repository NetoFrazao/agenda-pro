# E2E browser (Playwright)

**Status:** instalado (`@playwright/test` em `@agenda-pro/web`). Specs em `e2e/*.spec.ts`.

## Como rodar

```bash
# 1) stack local
npm run docker:up
npm run db:migrate
npm run prisma:seed -w @agenda-pro/api   # dono@demo.local / SenhaDemo123! / demo-barbearia
npm run dev:api   # :3001
npm run dev:web   # :3000

# 2) browsers (uma vez por máquina)
npx playwright install chromium

# 3) smoke live (PowerShell)
$env:E2E_LIVE="1"
npm run test:e2e:web

# Linux/macOS
E2E_LIVE=1 npm run test:e2e:web
```

Sem `E2E_LIVE=1` os smokes **fazem skip** (exit 0) — CI unitário não exige stack.

### Variáveis

| Var | Default |
|-----|---------|
| `E2E_BASE_URL` | `http://localhost:3000` |
| `E2E_API_URL` | `http://localhost:3001` |
| `E2E_EMAIL` | `dono@demo.local` |
| `E2E_PASSWORD` | `SenhaDemo123!` |
| `E2E_TENANT_SLUG` | `demo-barbearia` |

## Specs

| Arquivo | Cobertura |
|---------|-----------|
| `smoke-login.spec.ts` | Login → `/dashboard` |
| `smoke-booking.spec.ts` | Fluxo público `/u/[slug]` |
| `smoke-manage.spec.ts` | Cria via API + confirma em `/agendamento/[token]` |

## API E2E (Nest/Jest, não Playwright)

```bash
npm run test:e2e -w @agenda-pro/api
```

Requer `DATABASE_URL` + `REDIS_URL`. Inclui `booking.e2e-spec.ts` e `payment-happy-path.e2e-spec.ts` (MP double).
