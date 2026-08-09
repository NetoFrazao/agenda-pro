# QA Review — Agenda Pro (Testes)

**Data:** 2026-08-09  
**Escopo:** inventário real em `apps/api` e `apps/web` (sem alteração de código de produção)  
**Categoria:** Testes  
**Nota geral: 5.5 / 10**

---

## Resumo executivo

A API tem uma base sólida em **funções puras / regras de domínio** (availability, FSM, CRM segments, loyalty, tenant-scope) e um **e2e real com Postgres** cobrindo anti double-booking, manage-link, isolamento cross-tenant e FSM. O web está explicitamente sem testes (“Phase 1”). Faltam Playwright, testes de assinatura de webhooks (Stripe/MP), cobertura de `*.service` de orquestração e gates de coverage no CI.

---

## Inventário

### Tooling

| App | Runner | Scripts | Observação |
|-----|--------|---------|------------|
| `apps/api` | Jest + ts-jest | `test`, `test:watch`, `test:cov`, `test:e2e` | `jest --passWithNoTests`; e2e via `test/jest-e2e.json` (`*.e2e-spec.ts`, `runInBand`) |
| `apps/web` | — | `test` → echo “No web tests in Phase 1” | Sem Jest/Vitest/Playwright/Testing Library |
| Root / CI | workspaces + GitHub Actions | unit (`npm run test`) + e2e API com PG+Redis | Build web sem testes; `npm audit` soft |

Dependências presentes na API e **não exercitadas por specs de gateway**: `supertest`, `@nestjs/testing`, `stripe`.  
**Ausente no monorepo:** Playwright, Cypress, `@testing-library/*`, testes de segurança dedicados (OWASP/authz matrix além do e2e pontual).

### Contagem

| Tipo | Arquivos | Casos `it(` (aprox.) |
|------|----------|----------------------|
| Unit (`*.spec.ts`) | **19** | **~78** |
| E2E (`*.e2e-spec.ts`) | **1** (`booking.e2e-spec.ts`) | **5** |
| Web | **0** | **0** |

### Unit — mapa de arquivos

| Arquivo | Foco |
|---------|------|
| `common/availability/availability.engine.spec.ts` | Slots, overlap, buffer, antecedência, timezone/`@db.Date` |
| `appointments/appointment-state.spec.ts` | FSM M-03 |
| `clients/client-segment.spec.ts` + `clients-segment-rank.spec.ts` | Segmentação CRM + paginação pós-filtro |
| `loyalty/loyalty-credit.spec.ts` | Pontos + anti double-credit (P2002) |
| `payments/pix-lifecycle.service.spec.ts` | Release PENDING_PAYMENT + idempotência webhook `confirmPaid` |
| `billing/billing.service.spec.ts` + `plan-entitlements.spec.ts` | Guard `local_demo` / fail-closed; entitlements PIX/WhatsApp |
| `auth/auth.service.refresh.spec.ts` | Rotação atômica + reuse detection |
| `auth/auth.service.spec.ts` | Smoke EnvService JWT (quase vazio) |
| `account/account.service.spec.ts` | LGPD export/delete (mocks Prisma) |
| `common/waitlist/notify-next.spec.ts` | Claim atômico waitlist |
| `common/decorators/roles.guard.spec.ts` | RBAC OWNER/MEMBER |
| `common/tenant/tenant-scope.spec.ts` | Helper isolation |
| `common/time/timezone.spec.ts`, `crypto/tokens.spec.ts`, `pagination.spec.ts`, `cache/redis-cache.service.spec.ts`, `health/health.service.spec.ts` | Utilitários / health |

### E2E — `apps/api/test/booking.e2e-spec.ts`

1. Corrida 2-way no mesmo slot → `[201, 409]` e count=1  
2. Manage link: confirm + cancel (nome do teste menciona “bloqueado por prazo”, mas o fluxo **cancela com sucesso**)  
3. Isolamento cross-tenant (client GET / service PATCH → 404)  
4. Stress 6-way → exatamente 1×201; resto 409/429  
5. FSM dashboard: CANCELLED→COMPLETED → 400  

Bootstrap espelha `main.ts` (prefix `api`, ValidationPipe). Cleanup por `tenant.delete`. Requer `DATABASE_URL` + `REDIS_URL` vivos (CI ok).

### Web

Nenhum `*.test.*` / `*.spec.*`. Fluxos críticos UI sem rede de segurança: booking público (`/u/[slug]`), manage (`/agendamento/[token]`), auth, dashboard appointments/billing/PIX.

---

## Matriz de cobertura crítica

Legenda: **A** = asserts fortes / cenários relevantes · **P** = parcial (helpers ou mocks sem orquestração) · **E** = só e2e pontual · **∅** = gap

| Domínio crítico | Unit | E2E API | Web / Playwright | Pagamentos mock/gateway | Risco residual |
|-----------------|------|---------|------------------|-------------------------|----------------|
| Anti double-booking | P (engine overlap) | **A** | ∅ | — | Baixo na API; UI não coberta |
| Availability / slots | **A** | E (slots no book) | ∅ | — | Médio (HTTP service sem unit) |
| Appointment FSM | **A** | E (1 transição ilegal) | ∅ | — | Médio (service completo) |
| Auth login/register/reset | ∅ / smoke | E (register+cookie) | ∅ | — | **Alto** |
| Refresh token rotation | **A** (mock TX) | ∅ | ∅ | — | Médio |
| Multi-tenant isolation | P (helpers) | **A** (2 rotas) | ∅ | — | Médio (matriz incompleta) |
| RBAC RolesGuard | **A** | ∅ | ∅ | — | Médio |
| PIX lifecycle / idempotência | **A** (PixLifecycle) | ∅ | ∅ | **P** (Prisma mock; sem MP HTTP) | **Alto** (assinatura MP vazia) |
| Stripe billing webhooks | P (`local_demo` guard) | ∅ | ∅ | ∅ `constructEvent` | **Alto** |
| Plan entitlements | **A** | ∅ | ∅ | — | Baixo |
| Waitlist claim | **A** (notify-next) | ∅ | ∅ | — | Médio (controller/service) |
| Loyalty credit | **A** | ∅ | ∅ | — | Baixo–médio |
| LGPD account | **A** (mocks) | ∅ | ∅ | — | Médio |
| Notifications / WhatsApp | ∅ | ∅ | ∅ | — | **Alto** |
| Appointments / public book service | ∅ | E (happy+race) | ∅ | — | Médio |
| Reports / Team / Settings / Services CRUD | ∅ | E (create service) | ∅ | — | **Alto** |
| Frontend booking + dashboard | ∅ | ∅ | ∅ | — | **Crítico** |

---

## Qualidade de asserts

**Pontos fortes**
- E2E valida status HTTP **e** estado no Postgres (`count === 1`, `status` no DB).
- Pix/loyalty/waitlist usam `toHaveBeenCalledWith` + `objectContaining` em where/data atômicos.
- Availability e FSM cobrem edge cases (buffer, folga, terminais, PENDING_PAYMENT).

**Pontos fracos**
- `auth.service.spec.ts` só checa comprimento de secret — não exercita `AuthService`.
- Vários services grandes (`appointments`, `billing.handleStripeWebhook`, `mercadopago.verifyWebhookSignature`, `notifications`) sem suite.
- E2E #2: título promete cancel bloqueado por prazo; assert atual espera cancel **201** — documentação do teste desalinhada (risco de falsa confiança).
- Sem snapshots frágeis (bom); também sem contratos OpenAPI/schema asserts.

---

## Riscos de flakiness

| Risco | Onde | Por quê |
|-------|------|---------|
| `nextBusinessDay()` em UTC | e2e | Pula sáb/dom UTC; tenant é `America/Sao_Paulo` — feriados/virada de fuso podem zerar slots |
| Stress + throttle | e2e stress | Aceita 409 **ou** 429; ordem/timing pode mascarar regressão de race vs rate-limit |
| Índice de slot `[2]` | e2e stress | Fallback para `[0]` se grade curta — pode colidir com slots já usados no mesmo suite |
| `Date.now()` em runId / startsAt FSM | e2e | Baixo risco; cleanup depende de delete em cascata |
| Redis/Bull em AppModule full | e2e | Ambiente precisa serviços saudáveis; falha de infra ≠ falha de produto |
| Mocks de TX “felizes” | unit Pix/Auth | Não detectam deadlock/isolation real do Postgres |

Unitários de engine/timezone são majoritariamente **determinísticos** (datas fixas) — baixo flake.

---

## Gaps prioritários (problema padrão)

Formato: **problema · Categoria Testes**

1. **Web sem nenhum teste e sem Playwright — booking/manage/auth UI sem rede de segurança · Categoria Testes**  
2. **Webhooks MercadoPago (`x-signature`) e Stripe (`constructEvent`) sem testes de assinatura/rejeição · Categoria Testes**  
3. **Camada de orquestração sem unit/integration: `appointments.service`, `notifications`, waitlist/settings/team/reports · Categoria Testes**  
4. **Auth além do refresh: login, register, password reset e cookies HttpOnly sem cobertura unitária real · Categoria Testes**  
5. **Sem gate de cobertura (`coverageThreshold`) e `passWithNoTests` mascara regressão de suite vazia · Categoria Testes**  
6. **E2E único arquivo: sem suíte de security (IDOR amplo, JWT inválido, throttle auth) nem payment happy-path com MP/Stripe test doubles · Categoria Testes**  
7. **Nome/assert do teste de cancel por prazo desalinhados — risco de falso positivo · Categoria Testes**

---

## Top 5 (ação)

1. Introduzir **Playwright** (smoke): register → criar serviço → book público → manage confirm/cancel; login dashboard.  
2. Unit/integration para **`MercadoPagoService.verifyWebhookSignature`** + **`BillingService.handleStripeWebhook`** com payloads/assinaturas fixture.  
3. Expandir e2e (ou integration Nest) para **matriz tenant + roles** e fluxo PIX PENDING_PAYMENT → paid/expired.  
4. Substituir smoke de auth por testes reais de **login/refresh cookie/reuse** (já parcial no refresh unit).  
5. Remover `--passWithNoTests` (ou restringir) e adicionar **`coverageThreshold`** nos módulos críticos (`availability`, `appointment-state`, `pix-lifecycle`, `tenant-scope`).

---

## Nota (rubrica)

| Critério | Peso | Score | Comentário |
|----------|------|-------|------------|
| Domínios críticos cobertos | 30% | 6.5 | Booking race + FSM + availability fortes; payments gateway fraco |
| E2E / integração real | 25% | 7.0 | Bom e2e PG; único arquivo, sem UI |
| Web / E2E browser | 15% | 0 | Explicitamente Phase 1 |
| Qualidade de asserts | 15% | 7.0 | Críticos bons; auth smoke fraco |
| Flake / CI hygiene | 15% | 6.0 | CI corre e2e; riscos de data/throttle; sem coverage gate |

**Nota ponderada ≈ 5.5 / 10**

---

## Conclusão

O projeto **não está “sem testes”**: a API já protege o coração do produto (concorrência de booking, disponibilidade, FSM, idempotência PIX interna, refresh rotation, LGPD mocks). A nota fica puxada para baixo pela **ausência total de testes web**, **gaps de gateway/security payment**, e **orquestração de services** ainda descoberta — típico de Phase 1 com foco backend.
