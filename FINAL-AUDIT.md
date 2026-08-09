# Agenda Pro — Auditoria Final (Hardening)

**Data:** 2026-08-09  
**Branch:** `cursor/saas-hardening-crm-infra`  
**Commit de referência (local):** `ca20bb2` *(pode avançar se novos commits de docs forem adicionados)*

Este documento fecha o ciclo da missão de transformação SaaS (Fases 1–7 + Infra + Design). Detalhes por fase: [AUDIT.md](./AUDIT.md). Infra: [INFRASTRUCTURE-AUDIT.md](./INFRASTRUCTURE-AUDIT.md).

---

## O que foi encontrado

Auditoria inicial (Fase 1) apontou, entre outros:

- Billing `local_demo` podia ativar planos pagos sem Stripe
- `PENDING_PAYMENT` podia prender slot sem liberação
- Entitlements de plano anunciados e não enforced
- RBAC incompleto (MEMBER em mutações sensíveis)
- Gaps de PII no manage/book, JWT no body, refresh não atômico
- Ops: sem Docker app, backup/DR, ready check, índices CRM/PIX

## O que foi corrigido / implementado

### Segurança e fundação (Fase 2)

- Stripe fail-closed em produção; demo só com `ALLOW_BILLING_DEMO`
- PIX lifecycle + webhook libera/cancela `PENDING_PAYMENT`
- Plan entitlements (PIX / WhatsApp)
- RolesGuard OWNER nas mutações sensíveis
- Book sem `manageToken` cru; depositCents no dashboard
- E2E cross-tenant

### Core agenda (Fase 3)

- FSM de status (`appointment-state`)
- Waitlist notify-next com claim atômico
- Limite mensal no TZ do tenant
- Refresh atômico + revoke-on-reuse
- AuthGuard web com probe `/auth/me`
- Stress e2e double-booking

### Financeiro + LGPD (Fase 4)

- Webhook PIX idempotente (`confirmPaid`)
- Estados PIX incl. `REFUNDED`
- Billing Stripe past_due / cancel / LGPD
- Export + exclusão anonimizada (trilha financeira retida)
- Consent `marketingOptIn`

### CRM / fidelidade (Fase 5)

- Métricas reais + segmentação
- Ledger `LoyaltyTransaction` anti double-credit
- Tags / birthday; retenção 30/60/90; rebooking flag

### UX/UI (Design)

- Design system Graphite (tokens, Skeleton, a11y)
- DashboardShell mobile; booking/auth polish
- CRM UI: segmentos, filtros, tags, CTA rebooking

### Infra / DevOps

- Docker multi-stage API/Web + compose prod
- CI: validate, build, audit soft, docker build
- Índices query; `/health/ready`
- Scripts backup/restore + runbooks (RPO 24h / RTO 2h)

### Performance (Fase 7)

- Paginação appointments (`{ items, total, page, pageSize }`)
- Segment CRM antes da paginação
- Cache Redis perfil público (60s)
- Índice CRM metrics; selects enxutos

## O que foi removido / evitado

- Upgrade pago fake em produção
- Retorno de JWT no body auth
- Exposição de `manageToken` no book
- Mocks permanentes de receita no dashboard

## Mudanças no banco / migrations

| Migration | Tema |
|-----------|------|
| `20260809120000_phase8_market_parity` | Paridade mercado (já no master anterior) |
| `20260809210000_infra_query_indexes` | Índices infra |
| `20260809223000_phase4_pix_refunded` | PIX REFUNDED |
| `20260809240000_phase5_crm_loyalty` | Tags, birthday, LoyaltyTransaction |
| `20260809250000_phase7_crm_metrics_index` | Índice CRM metrics |

## Segurança

Ver [docs/SECURITY.md](./docs/SECURITY.md).

## Performance

Ver Status Fase 7 em [AUDIT.md](./AUDIT.md).

## UX

Graphite Studio; empty/loading/error; CRM e booking públicos refinados.

## Testes (última validação reportada pelas fases)

| Suite | Resultado |
|-------|-----------|
| Lint API/Web | OK |
| Unit API | ~78 |
| E2E API | 5 (booking race, manage, cross-tenant, stress) |

Fase 8 (suíte Playwright / cobertura plena) ainda é melhoria futura.

## Novas variáveis de ambiente

Ver [docs/ENV.md](./docs/ENV.md) e `.env.example`:

- `ALLOW_BILLING_DEMO`
- `MERCADOPAGO_WEBHOOK_SECRET`
- `DATABASE_CONNECTION_LIMIT`
- (demais Stripe/MP/Evolution já existentes, documentadas)

## Deploy

- [DEPLOYMENT.md](./DEPLOYMENT.md)
- Dockerfiles + `docker-compose.prod.yml`
- CI `.github/workflows/ci.yml`

## Riscos restantes

| Item | Severidade |
|------|------------|
| RBAC fino incompleto | Média |
| Loyalty redeem (B-11) sem endpoint | Baixa |
| Worker separado / outbox requeue | Média ops |
| Restore drill DR não executado E2E | Média ops |
| `npm audit` highs (soft) | Baixa |
| Playwright E2E frontend ausente | Média QA |
| Trigram search CRM | Baixa |

## Próximos passos recomendados

1. Publicar branch no GitHub (GitHub Desktop → Publish)
2. Fase 8: Playwright + mais testes de segurança
3. B-11 redeem loyalty + UI extrato
4. Worker process separado em prod
5. Restore drill documentado com evidência
6. Observabilidade (Sentry/OTel) quando houver staging

## Documentação gerada nesta rodada

Índice: [docs/DOCUMENTATION.md](./docs/DOCUMENTATION.md)
