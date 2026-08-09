# Design → Engineering requests

Pedidos do agente de UI/UX. Nenhuma alteração de backend foi feita pelo Design.

---

## [DESIGN → ENGINEERING] Pós Fase 5 (CRM polish)

Feature: CRM clients UI  
Status Design: **consumido** — lista com badges de `segment` + `inactiveBucket`, métricas (`avgTicketCents`, `visitsPerMonth`, `nextAppointmentAt`, etc.), filtro `?segment=` / `?inactiveDays=` via API, edição de tags/aniversário em `PATCH /api/clients/:id/profile`, consent + rebooking CTA no detalhe.  
Gaps restantes (opcional):
- UI de **ledger de pontos** de fidelidade (histórico de créditos/débitos) — API ainda não exposta na UI; Design consome quando houver endpoint de extrato.
- Filtro `segment` na API é **pós-métricas na página** (não recalcula total global). Se Engineering quiser filtro global com paginação correta, ajustar `ClientsService.list`.

Feature: Rebooking na agenda  
Status Design: **consumido** — ao marcar `COMPLETED`, se a resposta trouxer `rebookingSuggested` + `rebooking`, a agenda mostra CTA “Remarcar no WhatsApp”.  
Gap: deep-link para criar horário já pré-selecionando cliente/serviço (hoje WhatsApp + link genérico à lista de clientes).

---

## [ENGINEERING → DESIGN] Fase 5

Feature: CRM clients  
Status: API lista/detail com `segment`, `inactiveBucket`, métricas reais, `marketingOptIn`, `suggestRebooking`.  
UI: badge de segmento, ticket médio, consent toggle, alerta/CTA de rebooking, tags/aniversário, filtros.  
Ação Design restante: ledger de pontos (quando API existir).

Feature: Rebooking  
Status: `PATCH /api/appointments/:id/status` (COMPLETED) retorna `rebookingSuggested` + `rebooking`.  
UI: CTA “Remarcar” na agenda ao concluir atendimento.

---

## [ENGINEERING → DESIGN] Fase 4

Feature: Preços canônicos  
Status: API `/api/billing/plans` já retorna `priceCents` + `priceCentsMonthly` (fonte `env`).  
Ação Design: remover `PLAN_PRICE_PLACEHOLDERS` / FALLBACK divergente quando conveniente.

Feature: KPIs delta / no-show  
Status: **não** implementados nesta fase (custo > benefício imediato). Mantém request original abaixo.

Feature: LGPD  
Backend: `GET /api/account/export` + exclusão anonimizada. UI de download/export no dashboard settings fica a cargo do Design quando priorizar.

---

[DESIGN → ENGINEERING]
Feature: Preços de planos na UI
Necessidade visual: Exibir preço mensal real em `/planos` e `/dashboard/billing` sem fallback hardcoded.
Dados necessários: `priceCentsMonthly` (ou equivalente) por plano na resposta da API de plans/billing.
Endpoint atual: endpoints de plans/billing usados por `apps/web/src/app/planos/page.tsx` e `apps/web/src/app/dashboard/billing/page.tsx`
Problema: O frontend usa `PLAN_PRICE_PLACEHOLDERS` em `apps/web/src/lib/format.ts` quando a API não envia preço — risco de divergência com cobrança real.
Sugestão: Garantir que a API sempre retorne o preço canônico; depois o Design remove o placeholder.
Nenhuma alteração de backend realizada pelo agente de Design.

---

[DESIGN → ENGINEERING]
Feature: KPIs do dashboard (visão geral)
Necessidade visual: Cards de tendência (vs. semana/mês anterior) e taxa de no-show, se desejado no roadmap.
Dados necessários: Deltas percentuais ou valores do período anterior; no-show rate no summary.
Endpoint atual: `GET /api/reports/summary` (já usado no dashboard)
Problema: UI hoje só mostra totais absolutos disponíveis; sem comparação temporal.
Sugestão: Estender summary com campos opcionais (`revenueDeltaPct`, `noShowRate`) — Design consome quando existirem.
Nenhuma alteração de backend realizada pelo agente de Design.
