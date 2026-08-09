# Fase 0 — Escopo e validação (fechada)

## Decisões travadas

### Stack
- Frontend: Next.js 15 (App Router) + Tailwind
- Backend: NestJS + TypeScript
- ORM: Prisma
- DB: PostgreSQL 16
- Fila: Redis + BullMQ (Fase 4)
- Auth: JWT access + refresh (Fase 2)
- Monorepo: npm workspaces

### Público
Barbeiros e manicures (autônomos ou poucos profissionais), atendimento por horário marcado, Brasil.

### Diferencial no MVP
1. Lembrete WhatsApp via link `wa.me` + e-mail assíncrono (fila)
2. Produto 100% PT-BR, preço de serviço definido por conta

### Sinal PIX
Estrutura no schema (`depositCents`, status `PENDING_PAYMENT`); cobrança real na **Fase 7** (ou bônus imediato pós-deploy se validarmos demanda).

## MVP publicável (v1 = Fases 1–6)

- Multi-tenant + auth profissional
- Serviços, disponibilidade, agendamento público
- Anti double-booking
- E-mail + lembrete WhatsApp (wa.me)
- Dashboard + página `/u/[slug]`
- Testes críticos, Swagger, CI, deploy público
- Planos com preços via env (sem cobrança real ainda)

## Fora do MVP (bônus / Fase 7+)

- Stripe + PIX recorrente da assinatura SaaS
- LGPD (política, termos, exclusão) — Fase 7
- WhatsApp Business API oficial
- Comissão multi-profissional, combos avançados, Google Calendar
- App nativo

## Monetização (estrutura)

| Plano | Limites (exemplo) | Preço |
|-------|-------------------|--------|
| Starter | 1 profissional, limite mensal de bookings | `PLAN_STARTER_PRICE_CENTS` |
| Pro | WhatsApp reminders + PIX deposit flag | `PLAN_PRO_PRICE_CENTS` |
| Business | Até N profissionais | `PLAN_BUSINESS_PRICE_CENTS` |

Valores finais: validar com clientes reais — não hardcodar preço de venda no domínio.
