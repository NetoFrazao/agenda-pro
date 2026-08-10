# SCORECARD — Backend + Security

| Campo | Valor |
|-------|--------|
| **Data** | 2026-08-10 |
| **Branch** | `cursor/agent-backend-authz-r4` (base: `cursor/saas-hardening-crm-infra`) |
| **Escopo** | CSRF residual cookie-auth, MEMBER `updateStatus` scope, `User.role: UserRole` shared |
| **Nota inicial (domínio, pós Round 3)** | **8.9 / 10** |
| **Nota atual** | **9.3 / 10** |
| **Veredito** | CSRF double-submit cobrindo mutações cookie-auth restantes; MEMBER não altera status alheio; contrato `User.role` tipado. Residual fora ownership: Redis AUTH/TLS (DevOps). |

Critério: 10 = produção financeiramente crítica sem Alto residual no ownership; cada blocker Alto −0.4 a −0.6.

---

## O que foi corrigido (Round 4 — Agent Backend AuthZ)

| # | Item | Status | Evidência |
|---|------|--------|-----------|
| 1 | CSRF em settings / services / billing / waitlist (+ account, availability, reviews) | ✅ | `CsrfGuard` nos controllers cookie-auth; webhook Stripe isento |
| 2 | MEMBER `PATCH /appointments/:id/status` só se `professionalId === userId` | ✅ | `appointment-lifecycle.service.ts` + `appointments-member-scope.spec.ts` |
| 3 | `User.role` tipado como `UserRole` (não `string?`) | ✅ | `packages/shared/src/user.ts`; FE reexporta de `@agenda-pro/shared` |

### API breaking / avisos

- **SPA cookie-auth:** mutações em settings, services, billing (checkout/cancel), waitlist, account, availability e reviews passam a exigir `X-CSRF-Token` == cookie `ap_csrf` (Bearer continua isento). A SPA já envia o header via `api()`.
- **MEMBER** em `PATCH /appointments/:id/status` recebe 403 se o agendamento for de outro profissional.

### Round 3 (já na base)

| # | Item | Status |
|---|------|--------|
| 1 | MEMBER só lê própria agenda | ✅ |
| 2 | MEMBER só lê CRM com vínculo | ✅ |
| 3 | Race NotificationJob send-time | ✅ |
| 4 | Reschedule cancela PENDING antes de reenfileirar | ✅ |
| 5 | CSRF auth/clients/appointments/team | ✅ |
| 6 | E2E abuse/AuthZ | ✅ |

---

## Testes

```text
npm run lint -w @agenda-pro/api   # OK
npm run test -w @agenda-pro/api   # 31 suites / 156 tests OK
```

Cobertura nova/estendida (R4):

- `appointments-member-scope.spec.ts` — MEMBER 403 em status alheio; MEMBER/OWNER happy path

---

## Notas (honesto)

| Momento | Nota | Por quê |
|---------|------|---------|
| MEGA baseline (pré Fase 1) | 5.5 | Bypass PIX, manageToken plaintext, sem step-up, throttle frágil |
| Pré Round 1–2 (Fase 1 fechada) | **7.0** | PIX FSM/gate, manageToken hash, step-up |
| Pós Round 1–2 | **8.2** | Throttle Redis, CRM write RBAC, PAST_DUE, job PENDING cancel |
| Round 3 | **8.9** | MEMBER read scope, CSRF parcial, send-time reminder, e2e |
| **Atual (Round 4)** | **9.3** | CSRF residual cookie-auth + MEMBER status scope + UserRole shared |

**Por que não 10:** Redis AUTH/TLS continua DevOps; CSRF não é `APP_GUARD` global (aplicação explícita por controller — webhooks/public isentos de propósito).

---

## Blockers (domínio)

1. ~~CSRF não global~~ — **fechado R4** nas mutações cookie-auth restantes (settings/services/billing/waitlist/account/availability/reviews).
2. ~~MEMBER `updateStatus` sem filtro~~ — **fechado R4**.
3. **Redis AUTH / TLS** — DevOps (fora ownership).

---

## Arquivos tocados (Round 4)

- `apps/api/src/settings/settings.controller.ts`
- `apps/api/src/services/services.controller.ts`
- `apps/api/src/billing/billing.controller.ts`
- `apps/api/src/waitlist/waitlist.controller.ts`
- `apps/api/src/account/account.controller.ts`
- `apps/api/src/availability/availability.controller.ts`
- `apps/api/src/reviews/reviews.controller.ts`
- `apps/api/src/appointments/appointments.controller.ts`
- `apps/api/src/appointments/appointments.service.ts`
- `apps/api/src/appointments/appointment-lifecycle.service.ts`
- `apps/api/src/appointments/appointments-member-scope.spec.ts`
- `packages/shared/src/user.ts`
- `packages/shared/src/index.ts`
- `apps/web/src/lib/types.ts` *(tipo apenas; sem UI)*
- `docs/reviews/SCORECARD_BACKEND_SECURITY.md`

---

## Fora deste ownership (não regressados)

- Docker / worker compose / PIX reconcile out-of-process
- Prisma migrations novas
- `apps/web` UI (breaking CSRF/MEMBER acima documentados; SPA `api()` já manda CSRF)
- Rewrites do God Object além do escopo AuthZ
