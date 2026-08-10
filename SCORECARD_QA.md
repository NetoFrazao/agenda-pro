# SCORECARD QA — Agenda Pro

**Data:** 2026-08-09  
**Agente:** QA / Testes (Agente 5)  
**Branch:** `cursor/agent-qa`  
**Base:** `cursor/saas-hardening-crm-infra`

---

## Nota geral: **7.4 / 10**

Subiu de **6.0** → **7.4**: Playwright instalado de verdade + smokes (skip sem stack), suite ampla de `appointments.service` / `notifications`, happy-path MP/Stripe com doubles, `coverageThreshold` no Jest, e2e #2 alinhado + caso de prazo.

**Não** sobe mais porque smokes browser **não foram executados live** neste ciclo (stack/seed não disponível no ambiente do agente) e o Nest e2e de pagamento com Postgres **não foi re-rodado** aqui (só o double unitário).

---

## Evidência de execução

### Unit API
```
npm run test -w @agenda-pro/api -- --no-coverage --forceExit
→ Test Suites: 27 passed, 27 total
→ Tests:       133 passed, 133 total
→ exit 0
```

### Coverage + threshold
```
npm run test:cov -w @agenda-pro/api -- --forceExit
→ All files | Stmts 37.43 | Branch 31.25 | Funcs 29.64 | Lines 37.19
→ coverageThreshold global: branches 25 / functions 25 / lines 30 / statements 30
→ exit 0 (threshold ok)
```

### Playwright (sem stack)
```
npm run test:e2e:web
→ 3 skipped (E2E_LIVE≠1) — exit 0
```

### Nest e2e (booking + payment Postgres)
**Não re-executado** neste ciclo (requer `DATABASE_URL` + `REDIS_URL` vivos). Specs atualizados/adicionados:
- `apps/api/test/booking.e2e-spec.ts` (título #2 + novo caso prazo)
- `apps/api/test/payment-happy-path.e2e-spec.ts` (MP override)

---

## Itens do backlog

| # | Item | Status |
|---|------|--------|
| 1 | Playwright + smoke login / book / manage | **Feito** (deps + specs; live = skip sem `E2E_LIVE=1`) |
| 2 | Suite ampla appointments + notifications | **Feito** |
| 3 | Payment happy-path MP/Stripe doubles | **Feito** (unit); Nest e2e escrito, **não rodado** |
| 4 | `coverageThreshold` Jest | **Feito** (`passWithNoTests` removido) |
| 5 | e2e #2 título/assert desalinhados | **Feito** + teste explícito de bloqueio por prazo |

---

## Tests added / alterados

| Arquivo | Foco |
|---------|------|
| `e2e/playwright.config.ts` + `helpers.ts` + `run-live.cjs` | Setup Playwright |
| `e2e/smoke-login.spec.ts` | Login → dashboard |
| `e2e/smoke-booking.spec.ts` | Booking público `/u/[slug]` |
| `e2e/smoke-manage.spec.ts` | Manage link (API book + UI confirm) |
| `e2e/README.md` | Como rodar |
| `apps/api/src/appointments/appointments.service.spec.ts` | cancel prazo, orquestração cancel/updateStatus, list, mask, confirm idempotente |
| `apps/api/src/notifications/notifications.service.spec.ts` | enqueue confirmation/cancel/reset/waitlist (+ mock BullMQ) |
| `apps/api/src/payments/payment-happy-path.spec.ts` | MP approved + Stripe checkout completed doubles |
| `apps/api/test/payment-happy-path.e2e-spec.ts` | Nest+Postgres MP override |
| `apps/api/test/booking.e2e-spec.ts` | Título alinhado + cancel bloqueado por prazo |
| `apps/api/package.json` | threshold + remove `passWithNoTests` |
| root / web `package.json` | scripts `test:e2e:web` |

**Hook de teste mínimo:** `jest.mock('bullmq')` só em `notifications.service.spec.ts` (isolamento Redis — **não** muda produto).

---

## Como rodar

```bash
# Unit API
npm run test:api
npm run test:cov -w @agenda-pro/api

# Nest e2e (Postgres + Redis)
npm run docker:up
npm run test:e2e -w @agenda-pro/api

# Playwright smoke (live)
npx playwright install chromium
npm run docker:up && npm run db:migrate
npm run prisma:seed -w @agenda-pro/api   # dono@demo.local / SenhaDemo123! / demo-barbearia
npm run dev:api   # :3001
npm run dev:web   # :3000
npm run test:e2e:web:live
```

Credenciais demo: `dono@demo.local` / `SenhaDemo123!`, slug `demo-barbearia`.

---

## Matriz crítica (pós-ciclo)

| Domínio | Antes | Agora | Nota |
|---------|-------|-------|------|
| Playwright / web | 0 | **P** (instalado + smokes; live não validado aqui) | Skip limpo sem `E2E_LIVE` |
| Appointments orchestration | fraca | **A** (unit) | cancel/updateStatus/list/mask |
| Notifications enqueue | 1 caso | **A** | confirmation/reminders/cancel/waitlist/reset |
| Payment happy-path | unit gate | **A** unit + e2e spec | Nest e2e pending run |
| coverageThreshold | ausente | **A** | baseline conservador |
| E2E #2 prazo | desalinhado | **A** | título + assert + caso 400 |

---

## Rubrica

| Critério | Peso | Score | Comentário |
|----------|------|-------|------------|
| Domínios críticos cobertos | 30% | **8.5** | appointments/notifications/payment doubles |
| E2E / integração | 25% | **7.5** | booking e2e melhorado; payment e2e escrito |
| Web / Playwright | 15% | **6.0** | instalado + skip hygiene; live não evidenciado |
| Qualidade de asserts | 15% | **8.0** | ordem cancel→enqueue; mask PII; prazo |
| Flake / CI hygiene | 15% | **7.5** | threshold + skip sem stack; forceExit ainda necessário (BullMQ legado em outros specs) |

**Ponderado ≈ 7.4 / 10**

---

## Bugs encontrados (não corrigidos — fora de escopo QA)

Nenhum bug de produto confirmado neste ciclo. Observações de teste:

1. **Flake / open handles:** suites que instanciam `NotificationsService` sem mock BullMQ ainda podem logar `ECONNREFUSED` e exigir `--forceExit` (pré-existente; mitigado no novo spec via `jest.mock('bullmq')`).
2. **Playwright live:** não validado aqui — se seed/slots falharem, `smoke-booking` / `smoke-manage` podem flake por calendário/fim de semana (specs já pulam domingo/sábado na data).

---

## Pendências honestas

1. Rodar `npm run test:e2e:web:live` com stack + seed e colar evidência.
2. Rodar `npm run test:e2e -w @agenda-pro/api` (booking + payment Nest) com Postgres/Redis.
3. Subir `coverageThreshold` gradualmente (funcs ~29.6 — margem pequena acima de 25).
4. Opcional: mock BullMQ global no Jest setup para acabar com `--forceExit`.
