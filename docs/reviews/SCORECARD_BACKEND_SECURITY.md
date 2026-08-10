# SCORECARD — Backend + Security

| Campo | Valor |
|-------|--------|
| **Data** | 2026-08-09 |
| **Branch** | `cursor/agent-backend-authz` (base: `cursor/saas-hardening-crm-infra`) |
| **Escopo** | RBAC MEMBER leitura agenda/CRM, CSRF double-submit, NotificationJob send-time, e2e abuse/AuthZ |
| **Nota inicial (domínio, pós Round 1–2)** | **8.2 / 10** |
| **Nota atual** | **8.9 / 10** |
| **Veredito** | AuthZ de leitura MEMBER + CSRF cookie + race de lembrete no envio fechados com testes; residual médio em CSRF global e escopo MEMBER em mutações de status. |

Critério: 10 = produção financeiramente crítica sem Alto residual no ownership; cada blocker Alto −0.4 a −0.6.

---

## O que foi corrigido (Round 3 — Agent Backend AuthZ)

| # | Item | Status | Evidência |
|---|------|--------|-----------|
| 1 | MEMBER só lê própria agenda (`professionalId === userId`) | ✅ | `appointments.controller/service` + `appointments-member-scope.spec.ts` |
| 2 | MEMBER só lê CRM de clientes com vínculo (appointment próprio) | ✅ | `clients.controller/service` + `clients-member-scope.spec.ts` |
| 3 | Race NotificationJob PROCESSING: invalidação PENDING+PROCESSING + check no send (`startsAtIso`) | ✅ | `notifications.service.ts` (`isBookingReminderStillValid`, `processJob`) + spec |
| 4 | Reschedule chama `cancelPendingForAppointment` antes de reenfileirar | ✅ | `appointments.service.ts` `rescheduleByToken` |
| 5 | CSRF explícito (double-submit `ap_csrf` + `X-CSRF-Token`) | ✅ | `csrf.guard.ts`, `GET /auth/csrf`, cookies em login/register/refresh |
| 6 | E2E: register 429, book PAST_DUE 409, MEMBER CRM write 403 | ✅ | `test/authz-security.e2e-spec.ts` |

### API breaking / avisos

- **MEMBER** em `GET /appointments` e `GET /clients` (+ detail) deixa de ver agenda/CRM do tenant inteiro — só próprios agendamentos / clientes com vínculo.
- **SPA cookie-auth:** mutações em `auth` (refresh/logout), `clients`, `appointments`, `team` exigem header `X-CSRF-Token` igual ao cookie `ap_csrf` (Bearer continua isento).
- FE: esconder/filtrar UI de agenda/CRM completa para MEMBER; enviar CSRF em fetches cookie-based.

---

## Testes

```text
npm run lint -w @agenda-pro/api   # OK
npm run test -w @agenda-pro/api   # 28 suites / 129 tests OK
npm run test:e2e -w @agenda-pro/api -- --testPathPattern=authz-security  # 3/3 OK
```

Cobertura nova/estendida:

- `appointments-member-scope.spec.ts` — filtro MEMBER vs OWNER
- `clients-member-scope.spec.ts` — list/detail MEMBER
- `csrf.guard.spec.ts` — Bearer isento / cookie exige token
- `notifications.service.spec.ts` — cancel PENDING+PROCESSING + `isBookingReminderStillValid`
- `authz-security.e2e-spec.ts` — throttle register, PAST_DUE book, MEMBER 403 notes

---

## Notas (honesto)

| Momento | Nota | Por quê |
|---------|------|---------|
| MEGA baseline (pré Fase 1) | 5.5 | Bypass PIX, manageToken plaintext, sem step-up, throttle frágil |
| Pré Round 1–2 (Fase 1 fechada) | **7.0** | PIX FSM/gate, manageToken hash, step-up |
| Pós Round 1–2 | **8.2** | Throttle Redis, CRM write RBAC, PAST_DUE, job PENDING cancel |
| **Atual (Round 3)** | **8.9** | MEMBER read scope, CSRF double-submit, send-time reminder check, e2e |

**Por que não 9–10:** CSRF ainda não é guard global (settings/services/billing/etc. fora deste ownership); MEMBER ainda pode `PATCH /appointments/:id/status` em agendamento alheio se souber o id (só leitura foi filtrada); Redis AUTH/TLS continua DevOps.

---

## Blockers (domínio)

1. **CSRF não global** — aplicado em auth (refresh/logout) + clients + appointments + team. Outros controllers cookie-auth precisam do mesmo guard (outro agente / AppModule).
2. **MEMBER `updateStatus` sem filtro `professionalId`** — backlog Round 3 pediu só rotas de **leitura**; residual médio se MEMBER forçar id alheio.
3. **Redis AUTH / TLS** — DevOps (fora ownership).
4. **Dependência fora do path listado** — alteração mínima em `notifications/**` exigida pelo item Alto #2 (send-time); documentada aqui.

---

## Arquivos tocados

- `apps/api/src/appointments/appointments.controller.ts`
- `apps/api/src/appointments/appointments.service.ts`
- `apps/api/src/appointments/appointments-member-scope.spec.ts`
- `apps/api/src/appointments/appointments-security.spec.ts`
- `apps/api/src/clients/clients.controller.ts`
- `apps/api/src/clients/clients.service.ts`
- `apps/api/src/clients/clients-member-scope.spec.ts`
- `apps/api/src/auth/auth.controller.ts`
- `apps/api/src/auth/auth.cookies.ts`
- `apps/api/src/common/decorators/csrf.constants.ts`
- `apps/api/src/common/decorators/csrf.guard.ts`
- `apps/api/src/common/decorators/csrf.guard.spec.ts`
- `apps/api/src/team/team.controller.ts`
- `apps/api/src/notifications/notifications.service.ts` *(fora path; Alto #2)*
- `apps/api/src/notifications/notifications.service.spec.ts`
- `apps/api/test/authz-security.e2e-spec.ts`
- `SCORECARD_BACKEND_SECURITY.md`

---

## Fora deste ownership (não regressados)

- Docker / worker compose / PIX reconcile out-of-process
- Prisma migrations novas
- `apps/web` UI (breaking MEMBER/CSRF acima)
- Rewrites do God Object `AppointmentsService` além de list scope + reschedule cancelPending
