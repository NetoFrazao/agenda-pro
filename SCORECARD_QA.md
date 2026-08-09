# SCORECARD QA — Agenda Pro

**Data:** 2026-08-09  
**Agente:** QA (testes críticos)  
**Commit:** nenhum (conforme pedido)

---

## Nota geral: **6.0 / 10**

Melhora vs. inventário prévio (~5.5): webhooks MP/Stripe e contrato auth DTO cobertos em unit.  
**Não** sobe mais porque web continua **0 testes** e Playwright **não está instalado** (só setup documentado em `e2e/README.md`).

---

## Evidência de execução

```
npm run test -w @agenda-pro/api -- --no-coverage
→ Test Suites: 23 passed, 23 total
→ Tests:       108 passed, 108 total
→ exit 0
```

E2E API (`test:e2e`) **não** re-rodado neste ciclo (não alterado o bootstrap e2e; booking e2e pré-existente).

---

## Tests added neste ciclo

| Arquivo | Casos | Foco |
|---------|-------|------|
| `apps/api/src/payments/mercadopago.service.spec.ts` | 8 | HMAC `x-signature` válida/inválida; fail-closed prod sem secret; non-prod sem secret |
| `apps/api/src/payments/payments.controller.spec.ts` | 4 | Gate de assinatura → não chama `getPayment`; approved confirma; amount mismatch |
| `apps/api/src/billing/billing.service.spec.ts` *(expandido)* | +5 | `constructEvent` rejeita assinatura; checkout completed; PAST_DUE; deleted→STARTER; 503 sem config |
| `apps/api/src/auth/auth.contract.spec.ts` | 4 | Contrato Login/Register DTO (class-validator) — substituto honesto de smoke UI |
| `e2e/README.md` | — | Setup Playwright **planejado**; smoke login como rascunho; **sem** deps/`*.spec` browser |

**Total unit API após ciclo:** ~108 `it(` (era ~78–90 no inventário QA; delta ≈ +21 novos asserts).

---

## Matriz crítica (pós-ciclo)

| Domínio | Antes | Agora | Nota |
|---------|-------|-------|------|
| MP webhook signature | ∅ | **A** (unit + controller gate) | Fechado |
| Stripe webhook signature / handlers | ∅ / P | **A** (mock `constructEvent`) | Fechado em unit; sem Stripe real/e2e |
| PIX lifecycle idempotência | A | A | Pré-existente |
| Booking race / FSM / availability | A/E | A/E | Pré-existente |
| Auth login UI | ∅ | ∅ | Playwright não existe |
| Auth DTO contract | ∅ | **P** | Validação de shape, não HTTP login |
| Web / Playwright | **0** | **0** | Doc only — **não fingir coverage** |

---

## Rubrica

| Critério | Peso | Score | Comentário |
|----------|------|-------|------------|
| Domínios críticos cobertos | 30% | **7.5** | Gateways de assinatura cobertos; orquestração appointments/notifications ainda fraca |
| E2E / integração real | 25% | **7.0** | Mesmo `booking.e2e-spec.ts` forte; sem e2e PIX/Stripe |
| Web / E2E browser | 15% | **0** | Phase 1; README ≠ teste |
| Qualidade de asserts | 15% | **7.5** | HMAC + side-effect gates; auth.service.spec ainda smoke JWT |
| Flake / CI hygiene | 15% | **6.0** | Sem coverageThreshold; `passWithNoTests` permanece |

**Ponderado ≈ 6.0 / 10**

---

## Gaps que permanecem (honestos)

1. **Playwright / web = 0** — instalar + 1 smoke login real seria o próximo bump (~+0.8–1.2 na nota).  
2. `appointments.service` / `notifications` orquestração ainda sem suite ampla.  
3. Sem e2e payment happy-path com MP/Stripe test doubles.  
4. Sem `coverageThreshold` no Jest.  
5. E2E #2 (cancel por prazo) título/assert ainda desalinhados (pré-existente).

---

## Decisão de QA

**API:** apta para regressão unitária nos caminhos críticos de pagamento (assinatura) + domínio já coberto.  
**Produto E2E browser:** **não** aprovado — cobertura web inexistente.  
**Scorecard:** 6.0/10 — progresso real em webhooks; sem maquiagem de Playwright.
