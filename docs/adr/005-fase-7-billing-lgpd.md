# ADR 005 — Monetização e LGPD (Fase 7)

## Problema
SaaS precisa cobrar e cumprir exclusão de dados.

## Decisão
- Planos via env (`PLAN_*_PRICE_CENTS` / Stripe Price IDs)
- Checkout Stripe quando configurado; modo demo local sem chave
- Cancelamento self-service (`cancel_at_period_end`)
- `DELETE /api/account` apaga tenant e dados pessoais

## Trade-offs
PIX recorrente fica para validação com clientes reais (Asaas/MP); estrutura de planos já pronta.
