# API — contratos principais

Base URL local: `http://localhost:3001` · prefixo global `/api` · Swagger: `/docs` (se habilitado).

Autenticação dashboard: cookie `ap_access` **ou** `Authorization: Bearer <access>`.

## Auth

| Método | Rota | Notas |
|--------|------|-------|
| POST | `/auth/register` | Cookies; body `{ user, tenant }` sem JWT |
| POST | `/auth/login` | Idem; `tenantSlug` opcional |
| POST | `/auth/refresh` | Cookie ou body refresh |
| POST | `/auth/logout` | Limpa cookies |
| POST | `/auth/forgot-password` | Anti-enumeração; `tenantSlug` opcional |
| POST | `/auth/reset-password` | Token do e-mail |
| GET | `/auth/me` | Sessão atual |

## Público

| Método | Rota | Notas |
|--------|------|-------|
| GET | `/public/:slug` | Perfil (cache Redis 60s) |
| GET | `/public/:slug/slots` | Query: serviceId, date, professionalId? |
| POST | `/public/:slug/book` | Rate limited; resposta com `manageUrl` (não `manageToken` cru) |
| POST | `/public/:slug/waitlist` | |
| GET | `/public/appointments/:token` | PII mascarada |
| POST | `/public/appointments/:token/confirm\|cancel\|reschedule\|review` | |

## Dashboard (JWT)

| Área | Rotas |
|------|-------|
| Serviços | `/services` CRUD (writes OWNER) |
| Disponibilidade | `/availability/rules`, `/availability/exceptions` |
| Agenda | `GET /appointments?from&to&page&pageSize&professionalId` |
| Status | `PATCH /appointments/:id/status` |
| Clientes | `/clients` (+ segment, inactiveDays, profile, consent, notes) |
| Equipe | `/team` (writes OWNER) |
| Relatórios | `/reports/summary` (OWNER) |
| Settings | `/settings` (OWNER) |
| Billing | `/billing/plans`, checkout, cancel (OWNER) |
| Conta LGPD | `POST /account/export` + `DELETE /account` com body `{ password }` (step-up) |
| Waitlist / Reviews | `/waitlist`, `/reviews` |

## Breaking change (Fase 7)

`GET /api/appointments` **não** retorna mais um array.

```json
{
  "items": [ /* appointments */ ],
  "total": 42,
  "page": 1,
  "pageSize": 100
}
```

`pageSize` máximo: **100**.

## Webhooks

| Rota | Provider |
|------|----------|
| `POST /api/webhooks/mercadopago` | PIX — assinatura + idempotência |
| `POST /api/webhooks/stripe` | Billing SaaS |

## Health

| Rota | Semântica |
|------|-----------|
| `GET /api/health` | Liveness |
| `GET /api/health/ready` | Readiness PG+Redis |

## Erros

Filtro global Nest: status HTTP + mensagem. Em evolução: `code` + `requestId` padronizados (ver AUDIT médios).
