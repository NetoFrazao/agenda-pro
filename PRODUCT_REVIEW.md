# Agenda Pro — Product Review (SaaS)

**Data:** 2026-08-09  
**Workspace:** `C:\Users\João Neto\Projects\agenda-pro`  
**Escopo:** Onboarding · booking funnel · retenção/CRM · billing/planos · multi-tenant UX · conversão · gaps · readiness comercial  
**Método:** Evidência em rotas/telas/API reais vs expectativa de mercado (Booksy/Fresha-like, nicho BR beleza), sem copiar produtos.  
**Categoria:** Produto  
**Alterações de código:** nenhuma (somente este documento).

---

## Nota geral

| Dimensão | Nota (0–10) | Leitura rápida |
|----------|-------------|----------------|
| Onboarding / time-to-value | **4.5** | Conta criada, mas “primeira receita” depende de setup manual |
| Booking funnel (público) | **8.0** | Funil multi-etapa sólido + manage link + PIX/espera |
| Retenção / CRM | **6.5** | Segmentos e hints bons; loops de retenção ainda manuais |
| Billing / planos | **6.0** | Stripe + entitlements reais; self-serve e trial de produto fracos |
| Multi-tenant UX | **7.0** | Isolamento por slug ok; escala salão/multi-unidade limitada |
| Conversão (site → pago) | **6.5** | Landing/planos claros; ativação e upsell pós-signup frágeis |
| **Produto / readiness comercial** | **6.8** | Pronto para early adopters solo; não para GTM agressivo vs mercado |

**Veredito:** núcleo de produto competitivo para autônomo BR (link no bio + lembrete + sinal). Falta o “sistema operacional de ativação e crescimento” que Booksy/Fresha usam para converter trial em hábito e hábito em plano pago.

---

## Mapa de evidência (features reais)

| Área | Evidência no repo |
|------|-------------------|
| Marketing / conversão | `/` (hero + CTAs), `/planos`, `/register`, `/login` |
| Auth / conta | `/register` → `POST /api/auth/register`; reset `/esqueci-senha`, `/redefinir-senha` |
| Dashboard dono | `/dashboard`, agenda, serviços, horários, equipe, clientes, relatórios, espera, avaliações, planos, ajustes |
| Booking público | `/u/[slug]` — passos serviço → profissional? → dia → horário → dados → confirmação |
| Pós-booking cliente | `/agendamento/[token]` — confirmar / cancelar / remarcar / avaliar / PIX |
| Billing | `/dashboard/billing`, `GET/POST /api/billing/plans|checkout|cancel`, Stripe webhooks; entitlements em `plan-entitlements.ts` |
| CRM / retenção | `/dashboard/clients` (segmentos, 30/60/90), loyalty em settings, rebooking hint pós-COMPLETED |
| Multi-tenant | Tenant por `slug`; página pública `/u/:slug`; plano `maxProfessionals` 1→5 |

Planos enforceáveis (código): **STARTER** (limites, sem WA/PIX) · **PRO** (WA + PIX, 1 profissional) · **BUSINESS** (ilimitado bookings, até 5 profissionais). Register nasce em **STARTER** + subscription `TRIALING` sem trial de produto na UI.

---

## Problemas (formato padrão · Categoria Produto)

### P-01 — Onboarding sem caminho até o primeiro agendamento

- **Categoria:** Produto  
- **Severidade:** Alta (ativação)  
- **Evidência:** `POST /api/auth/register` cria tenant + disponibilidade Seg–Sex 09–18, **sem serviço seed**. UI `/register` redireciona direto para `/dashboard`. Overview copia link público, mas `/u/[slug]` sem serviços ativos = funil morto. Não há checklist/wizard (serviço → foto/sobre → testar link → compartilhar).  
- **Expectativa mercado:** setup guiado 3–5 min até “link compartilhado”; templates de serviço por vertical.  
- **Impacto:** churn silencioso no dia 0; “Começar grátis” não entrega valor.  
- **Recomendação:** wizard pós-signup + 1 serviço template + empty states com CTA único; medir “primeiro serviço” e “primeiro booking”.

### P-02 — Status TRIALING sem trial comercial na experiência

- **Categoria:** Produto  
- **Severidade:** Média (monetização)  
- **Evidência:** Register grava `SubscriptionStatus.TRIALING` + plano STARTER. `BillingService` documenta ausência de `trial_period_days` no Checkout; UI de billing não mostra “X dias de trial / o que libera no Pro”. STARTER já é “grátis permanente” com teto — trial não diferencia.  
- **Expectativa mercado:** trial pago com features Pro (WA/PIX) por N dias, depois downgrade claro.  
- **Impacto:** upsell depende de dor descoberta tarde; pricing page não ancora urgência.  
- **Recomendação:** trial Pro 7–14d com banner de countdown + soft-lock de PIX/WA, ou renomear TRIALING → ACTIVE no STARTER para não mentir ao produto.

### P-03 — Funil público forte, mas ativação do dono e “vitrine” ainda rasas

- **Categoria:** Produto  
- **Severidade:** Baixa–Média (conversão cliente final)  
- **Evidência:** `/u/[slug]` tem steps, profissional opcional, waitlist, PIX, reviews publicados — alinhado ao padrão Calendly/Booksy de auto-agendamento. Perfil público cobre nome/about/endereço/WhatsApp/avaliações; falta portfólio visual, políticas claras na UI do funil, e atalho “favoritar profissional”.  
- **Expectativa mercado:** confiança visual + políticas + remarcação óbvia no mesmo fluxo.  
- **Impacto:** conversão do cliente final boa para MVP; teto competitivo em confiança/marca do salão.  
- **Recomendação:** bloco de políticas (sinal, cancelamento) no step final; fotos opcionais no perfil; deep-link de remarcação já existe via manage token — destacar no SMS/WA.

### P-04 — CRM e fidelidade acumulam sinal, mas retenção ainda é “abra o WhatsApp”

- **Categoria:** Produto  
- **Severidade:** Média (retenção)  
- **Evidência:** Segmentos `new|frequent|vip|inactive|at_risk`, filtros 30/60/90, consent marketing, pontos loyalty + ledger, hint de remarcar pós-COMPLETED e no detalhe do cliente — tudo via link `wa.me` manual. Sem campanha em massa, sem agendamento de win-back, sem **resgate** de pontos (AUDIT cita redeem/DEBIT como pendente).  
- **Expectativa mercado:** campanhas leves + ofertas de retorno + benefícios de fidelidade visíveis ao cliente.  
- **Impacto:** dono vê quem está em risco, mas não escala retenção; loyalty vira métrica sem loop.  
- **Recomendação:** P0 produto = “enviar lembrete de retorno” a partir do filtro inativo (fila + opt-in); P1 = resgate simples (desconto no próximo booking).

### P-05 — Billing operacional, self-serve incompleto para SaaS pago

- **Categoria:** Produto  
- **Severidade:** Alta (readiness comercial)  
- **Evidência:** Checkout Stripe, cancel ao fim do período, fail-closed sem chave, entitlements PIX/WA no código. Gaps documentados no próprio `billing.service.ts`: sem Customer Portal, sem dunning/grace UX, sem recibos no app, sem proration UI. `/planos` CTA “Começar” → `/register` (não checkout). Fallback local de planos pode divergir da API (limites/PIX no FALLBACK vs `PLAN_META` + entitlements).  
- **Expectativa mercado:** upgrade in-app, portal de cartão, invoices, mensagem clara em past_due.  
- **Impacto:** suporte manual; risco de confiança em cobrança; conversão paga pós-ativação mais lenta.  
- **Recomendação:** Stripe Customer Portal + banner PAST_DUE; alinhar copy de `/planos` ao `listPlans()`; CTA “Assinar Pro” logado → checkout direto.

### P-06 — Multi-tenant adequado a solo; frouxo para salão em crescimento

- **Categoria:** Produto  
- **Severidade:** Média (ICP expansion)  
- **Evidência:** Um tenant por registro; equipe com limite por plano (PRO=1, BUSINESS=5); login com mesmo e-mail em múltiplos tenants exige `tenantSlug`. Sem multi-unidade, sem branding white-label, sem papéis finos além OWNER/MEMBER nas telas. Dashboard é single-business.  
- **Expectativa mercado:** Fresha-like escala multi-staff cedo; Booksy empurra discovery + vários profissionais.  
- **Impacto:** ICP solo/barbearia 1 cadeira = ok; salão 3+ cadeiras esbarra cedo (só BUSINESS + teto 5).  
- **Recomendação:** deixar PRO com 2–3 profissionais (âncora de upgrade) ou trial Business; seletor de tenant no login quando houver colisão de e-mail.

### P-07 — Conversão de marketing sem ponte de ativação / upsell

- **Categoria:** Produto  
- **Severidade:** Média (growth)  
- **Evidência:** Landing forte (proposta link/WA/PIX), `/planos` com “Mais popular” no PRO. Pós-register: overview com stats vazios e copy de link — sem paywall contextual (“ative PIX no Pro”), sem comparação de uso vs limite STARTER (60 bookings/mês no backend).  
- **Expectativa mercado:** gatilhos de upgrade quando o valor aparece (faltas, fila, segundo profissional).  
- **Impacto:** muitos ficam no STARTER sem sentir o paid wedge.  
- **Recomendação:** upgrade prompts em: limite próximo, toggle PIX no serviço, 2º profissional, WhatsApp reminder settings.

### P-08 — Lacunas vs expectativa Booksy/Fresha (não blockers do MVP, blockers de paridade)

- **Categoria:** Produto  
- **Severidade:** Baixa–Média (roadmap)  
- **Evidência / ausência no produto atual:** marketplace/discovery, app nativo/PWA push, Google Calendar sync, pacotes/assinaturas de cliente, fila de caixa/POS, comissão payroll completa, gift cards, marca branca, multi-local. O que **existe** e já fecha o núcleo: anti double-booking, manage token, waitlist, reviews, reports, PIX BR, WA reminders, LGPD export/delete.  
- **Expectativa mercado:** plataforma “tudo do salão”; Agenda Pro é “agenda + presença + sinal”.  
- **Impacto:** posicionamento correto se a messaging ficar no nicho; perdedor se vender “substituto Fresha completo”.  
- **Recomendação:** GTM = “link no bio que reduz falta”; roadmap P1 = ativação + portal billing + retenção assistida; marketplace só depois de densidade local.

---

## Pontos fortes (não são problemas)

1. **Funil `/u/[slug]` + `/agendamento/[token]`** — padrão de mercado certo (sem forçar conta de cliente).  
2. **Wedges BR reais** — PIX Mercado Pago + lembretes WhatsApp com entitlements enforceados.  
3. **CRM light usable** — segmentos + inatividade + consent + hint de rebooking.  
4. **Billing honesto** — fail-closed e gaps documentados no serviço (raro e saudável).  
5. **Superfície de dono completa** — nav cobre agenda → CRM → equipe → planos sem buracos óbvios de IA “fake SaaS”.

---

## Readiness comercial

| Critério | Status |
|----------|--------|
| Vender para barbeiro/manicure solo (early access) | **Sim**, com onboarding assistido (humano ou wizard) |
| Self-serve PLG sem suporte | **Não** — ativação e billing self-serve incompletos |
| Competir feature-a-feature com Booksy/Fresha | **Não** — e não precisa; messaging deve evitar essa promessa |
| Cobrar Pro/Business com confiança | **Quase** — Stripe ok; falta portal, trial claro, upgrade contextual |
| Escala multi-profissional | **Parcial** — BUSINESS até 5; PRO ainda single-pro |

**Condição de go-to-market enxuto:** fechar P-01 + P-05 (+ um trigger de P-07) antes de ads pagos. Sem isso, CAC queima em contas vazias.

---

## Top 5 prioridades de produto

1. **Wizard de ativação** (serviço + testar `/u/slug` + compartilhar) — desbloqueia valor do funil já construído.  
2. **Trial/upsell honesto** (Pro com WA/PIX por tempo limitado ou prompts no momento da dor).  
3. **Stripe Customer Portal + UX past_due** — higiene mínima de SaaS pago.  
4. **Retenção assistida** a partir de segmentos inativos (fila + opt-in), não só `wa.me` manual.  
5. **Resgate de loyalty + políticas no funil público** — fecha loops que já têm dados no CRM/booking.

---

## Nota final

**6.8 / 10** — produto com núcleo comercialmente crível para o ICP solo BR; readiness de GTM self-serve ainda abaixo do padrão de mercado por onboarding, trial e billing self-serve.
