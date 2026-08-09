# Segurança — Agenda Pro

## Controles implementados

### Autenticação

- Cookies httpOnly + `SameSite=Lax` (+ `Secure` em produção)
- Tokens **não** retornados no JSON de login/register (mitiga XSS lendo body)
- Refresh com rotação atômica e invalidação em reuse
- JWT validado contra DB (`isActive`, `deletedAt`, tenant ativo)
- Rate limit em login / forgot / book público / webhooks
- Reset de senha: token hasheado, uso único, invalida tokens anteriores
- **Step-up LGPD:** `POST /account/export` e `DELETE /account` exigem senha do OWNER

### Autorização e multi-tenant

- `tenantId` da sessão; queries com `where: { id, tenantId }`
- `RolesGuard` OWNER em account delete, billing, settings, team writes, services/availability mutações sensíveis
- E2E cross-tenant: tenant B → 404 em recursos de A
- `professionalId` em availability validado no tenant

### Pagamentos

- Stripe: sem `STRIPE_SECRET_KEY` em produção → upgrade pago **503** (sem `local_demo`)
- Mercado Pago webhook: assinatura + valor + `external_reference`
- PIX: fail-closed na criação; lifecycle de expiração; `confirmPaid` atômico (idempotente)
- Webhook duplicado não reconfirma / não reenvia side-effects críticos

### LGPD

- Export de dados do titular (OWNER)
- Exclusão com anonimização; trilha financeira/auditoria retida conforme política
- `marketingOptIn` no booking / consent no cliente
- Manage link: PII mascarada; throttle; sem `manageToken` cru no body do book (só `manageUrl`)

### Infra / headers

- Helmet na API
- CORS com credentials
- Secrets só via env; `.env` no `.gitignore`
- Imagens Docker non-root + healthcheck
- `/api/health/ready` fail-closed sem Redis/PG

## Checklist OWASP (resumo)

| Risco | Mitigação |
|-------|-----------|
| Broken access / IDOR | tenantId + RolesGuard + testes |
| Injection | Prisma parameterized |
| XSS | Cookies httpOnly; UI React escape |
| CSRF | SameSite cookies; APIs state-changing autenticadas |
| Brute force | Throttle login/forgot |
| Webhook spoofing | Signature + amount + ref |
| Secrets in git | `.env.example` placeholders only |

## Pendências conhecidas

- RBAC fino (ADMIN/MANAGER/RECEPTIONIST) — não implementado
- CSRF token explícito além de SameSite (avaliar se cookie cross-site mudar)
- Outbox requeue / worker dedicado (M-06 / B-13)
- `npm audit` highs no lockfile (CI soft-fail)

Detalhes históricos: [AUDIT.md](../AUDIT.md).
