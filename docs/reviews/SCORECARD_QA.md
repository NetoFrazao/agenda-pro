# SCORECARD QA — Agenda Pro (Round 4)

**Data:** 2026-08-10  
**Agente:** QA Evidência Real (Agente 3 / R4)  
**Branch:** `cursor/agent-qa-r4`  
**Base:** `cursor/saas-hardening-crm-infra` @ `d6103e61cf515fcc8c7a8cd37ac92f14082e044f`  
**Worktree:** `C:\Users\João Neto\Projects\agenda-pro-agent-qa-r4`

---

## Nota geral: **8.2 / 10**

Subiu de **7.4** → **8.2**: Playwright live executado de verdade (2/3), Nest e2e booking + payment rodados com Postgres/Redis reais, `coverageThreshold` apertado com margem real, e `appointments-security` revalidado (já verde).

**Não** sobe mais porque `smoke-booking` falhou live (mojibake UTF-8 em `PublicBookingClient.tsx` — bug de produto reportado, fora do escopo de fix QA) e a suite Nest e2e completa ainda sofre contaminação de throttle Redis entre specs.

---

## Evidência de execução

### Infra
```
docker ps → agenda-pro-postgres Up (healthy) :5432
           agenda-pro-redis    Up (healthy) :6379
npm run db:migrate → No pending migrations
npm run prisma:seed -w @agenda-pro/api → Seed OK — tenant=demo-barbearia users=1
API :3001 (node dist/apps/api/src/main.js) + Web :3000 (next dev) → health/HTTP 200
```

### Unit API + coverageThreshold
```
npm run test -w @agenda-pro/api -- --testPathPattern=appointments-security --no-coverage --forceExit
→ Test Suites: 1 passed
→ Tests:       6 passed (incl. rescheduleByToken)
→ exit 0

npm run test:cov -w @agenda-pro/api -- --forceExit
→ All files | Stmts 44.48 | Branch 37.20 | Funcs 35.30 | Lines 44.09
→ coverageThreshold global: branches 32 / functions 30 / lines 38 / statements 38
  (antes: 25 / 25 / 30 / 30)
→ exit 0 (threshold ok; Test Suites: 31 passed, Tests: 157 passed)
```

### Playwright live (`E2E_LIVE=1`)
```
npm run test:e2e:web:live
→ Running 3 tests using 1 worker
→ ok  smoke-login.spec.ts     (dono → dashboard)           ~6.0s
→ ok  smoke-manage.spec.ts    (confirm /agendamento/token) ~4.5s
→ x   smoke-booking.spec.ts   (cliente /u/[slug])          ~26.9s
→ 1 failed, 2 passed (38.9s) — exit 1

Falha:
  expect(getByText(/Serviço|serviço/i)).toBeVisible() timeout 20s
Causa raiz (produto, não flaky de stack):
  apps/web/src/app/u/[slug]/PublicBookingClient.tsx tem strings com mojibake
  (ex.: service: 'Servi├ºo' em vez de 'Serviço'). Página sobe, serviços da API
  OK (GET /api/public/demo-barbearia 200 com 2 services), mas o texto na UI
  não casa com o assert do smoke.
```

### Nest e2e (booking + payment, Postgres + Redis)
```
# 1ª corrida: suite completa
npm run test:e2e -w @agenda-pro/api
→ PASS test/booking.e2e-spec.ts
→ FAIL test/authz-security.e2e-spec.ts  (register throttle: expected first 5×201, got mixed 429)
→ FAIL test/payment-happy-path.e2e-spec.ts (register 429 — contaminação Redis do spec anterior)
→ Test Suites: 2 failed, 1 passed, 3 total | Tests: 2 failed, 9 passed, 11 total

# 2ª corrida (após ~65s de janela de throttle): só booking + payment
npm run test:e2e -w @agenda-pro/api -- --testPathPattern="booking.e2e-spec|payment-happy-path.e2e-spec"
→ PASS test/payment-happy-path.e2e-spec.ts (9.2s)
→ PASS test/booking.e2e-spec.ts
→ Test Suites: 2 passed, 2 total
→ Tests:       8 passed, 8 total
→ exit 0
```

---

## Itens do backlog R4

| # | Item | Status |
|---|------|--------|
| 1 | Playwright live real + evidência | **Feito** (2/3 pass; booking fail documentado) |
| 2 | Nest e2e booking + payment com PG/Redis | **Feito** (8/8 na corrida isolada) |
| 3 | Fix `appointments-security` `rescheduleByToken` | **Já verde** — 6/6 sem alteração de código |
| 4 | Subir `coverageThreshold` gradual | **Feito** (25/25/30/30 → 32/30/38/38) |

---

## Changes neste ciclo

| Arquivo | Foco |
|---------|------|
| `apps/api/package.json` | `coverageThreshold` branches 32 / functions 30 / lines 38 / statements 38 |
| `docs/reviews/SCORECARD_QA.md` | Evidência R4 + nota 8.2 |

---

## Rubrica

| Critério | Peso | Score | Comentário |
|----------|------|-------|------------|
| Domínios críticos cobertos | 30% | **8.5** | Unit amplo intacto; security spec verde |
| E2E / integração | 25% | **8.5** | booking + payment Nest evidência real |
| Web / Playwright | 15% | **7.5** | live 2/3; booking bloqueado por mojibake |
| Qualidade de asserts | 15% | **8.0** | asserts honestos; falha booking não mascarada |
| Flake / CI hygiene | 15% | **7.5** | threshold mais apertado; throttle Redis entre e2e ainda flake |

**Ponderado ≈ 8.2 / 10**

---

## Bugs encontrados (não corrigidos — fora de escopo QA)

1. **UTF-8 mojibake em `PublicBookingClient.tsx`** (também presente na base): labels `Servi├ºo`, `hor├írio`, `p├ígina…`, etc. Quebra `smoke-booking` (`getByText(/Serviço|serviço/i)`). API pública OK; é bug de encoding no fonte web.
2. **Nest e2e + throttle Redis compartilhado:** `authz-security` e specs seguintes competem no mesmo bucket de rate-limit de `/auth/register` → 429 em sequência se a suite roda completa sem reset de janela. Não é bug de produto; hygiene de teste/isolamento.
3. **`nest start` / `dist/main.js` path:** build emite `dist/apps/api/src/main.js` (rootDir expandido via path `@agenda-pro/shared`). Workaround usado: `node dist/apps/api/src/main.js`. Pré-existente / monorepo — reportado, não fixado.

---

## Pendências honestas

1. Frontend: corrigir encoding UTF-8 em `PublicBookingClient.tsx` e re-rodar `smoke-booking` até 3/3.
2. Isolar throttle Redis entre specs Nest e2e (ou `FLUSHDB` de chaves de rate-limit entre suites).
3. Opcional: alinhar `outDir`/rootDir do Nest para `dist/main.js` novamente.
4. Opcional: mock BullMQ global no Jest setup para acabar com `--forceExit`.
