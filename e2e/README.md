# E2E browser (Playwright) — setup planejado

**Status:** não instalado. `@agenda-pro/web` ainda declara `No web tests in Phase 1`.  
Não há suite Playwright neste repositório — a cobertura de UI é **0**. Não trate este doc como coverage.

## Por que ainda não

- Smoke real (login dashboard + booking `/u/[slug]`) exige app web + API + Postgres + Redis vivos, seeds estáveis e selectors estáveis.
- Custo de CI/flake > valor imediato enquanto os gaps de gateway (webhooks) e contrato auth na API estavam abertos.

## Setup sugerido (quando for prioridade)

```bash
# na raiz do monorepo
npm init playwright@latest
# ou no workspace web:
# cd apps/web && npm i -D @playwright/test && npx playwright install
```

Config mínima sugerida: `e2e/playwright.config.ts` com `baseURL=http://localhost:3000`, `webServer` apontando para `npm run dev:web` (e API em 3001 se necessário).

### Smoke #1 — login (rascunho)

```ts
// e2e/smoke-login.spec.ts  (NÃO existe ainda — exemplo)
import { test, expect } from '@playwright/test';

test('login dashboard', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel(/e-?mail/i).fill(process.env.E2E_EMAIL!);
  await page.getByLabel(/senha|password/i).fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: /entrar|login/i }).click();
  await expect(page).toHaveURL(/dashboard/);
});
```

Pré-requisitos: usuário seed (`E2E_EMAIL` / `E2E_PASSWORD`), `docker compose up`, API+web rodando.

## O que existe hoje no lugar de Playwright

| Camada | Onde | O que cobre |
|--------|------|-------------|
| Unit webhooks MP/Stripe | `apps/api/src/payments/*.spec.ts`, `billing.service.spec.ts` | Assinatura / `constructEvent` mock |
| Contrato auth (DTO) | `apps/api/src/auth/auth.contract.spec.ts` | Login/Register validation rules |
| E2E API (Postgres) | `apps/api/test/booking.e2e-spec.ts` | Race booking, manage link, tenant isolation, FSM |

Rodar API unit: `npm run test -w @agenda-pro/api`  
Rodar API e2e: `npm run test:e2e -w @agenda-pro/api` (requer `DATABASE_URL` + `REDIS_URL`)
