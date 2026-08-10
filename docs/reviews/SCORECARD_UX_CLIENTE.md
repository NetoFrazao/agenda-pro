# SCORECARD — UX Cliente / Booking Público (Agenda Pro)

| Campo | Valor |
|-------|--------|
| **Data** | 2026-08-10 |
| **Branch** | `cursor/agent-ux-cliente` |
| **Base** | `cursor/saas-hardening-crm-infra` @ `5fcba31` |
| **Escopo** | `/u/[slug]/**`, `/agendamento/[token]/**` (+ toque mínimo em `SlotListbox` / `icons`) |
| **Nota inicial (fundação)** | **7.4 / 10** |
| **Nota atual** | **8.7 / 10** |
| **Veredito** | Funil público mais curto no mobile (dia+horário juntos), Skeleton/Toast do DS, empty com próxima vaga, confirmação celebratória e manage acolhedor — Graphite preservado. |

Critério: 10 = funil mínimo de cliques, loading/empty/erro consistentes com DS, confirmação com resumo completo + conquista, manage claramente “cliente”, touch ≥44px e copy humana em 320–390px.

---

## Backlog

| # | Prioridade | Item | Status |
|---|------------|------|--------|
| 1 | Alto | Fluxo serviço→data→horário→confirmação: menos cliques/rolagem mobile | ✅ Dia+horário unificados; chips de data; slot avança direto aos dados; stepper clicável em etapas concluídas |
| 2 | Alto | Skeleton ao carregar horários; empty acolhedor + próxima data com vaga | ✅ `SlotsSkeleton` + probe 14 dias + CTA “Ver {data}” |
| 3 | Alto | Confirmação com resumo completo + sensação de conquista | ✅ Hero mint/sucesso, CheckCircle2, resumo (serviço/preço/duração/quando/cliente/endereço), link em painel ink |
| 4 | Médio | Página gerenciar agendamento (token) acolhedora | ✅ Saudação pelo nome, cards com ícones, Toast, Skeleton, copy humana |
| 5 | Médio | Viewport 320–390px, touch ≥44px | ✅ `min-h-11` em chips/steps/slots; padding `px-4`; steps com label visível no mobile |
| 6 | Médio | Copy acolhedora (não corporativa) | ✅ Títulos/CTAs reescritos (“O que você gostaria?”, “Tudo certo! Até logo”, etc.) |

---

## Arquivos tocados

- `apps/web/src/app/u/[slug]/PublicBookingClient.tsx` — funil unificado, Skeleton/Toast, empty+próxima vaga, confirmação
- `apps/web/src/app/agendamento/[token]/page.tsx` — manage cliente, Toast, Skeleton, StarPicker brass
- `apps/web/src/components/SlotListbox.tsx` — `min-h-11` nos chips (touch)
- `apps/web/src/components/icons.ts` — export `MapPin`
- `docs/reviews/SCORECARD_UX_CLIENTE.md` — este scorecard

---

## Testes

```text
npm run lint -w @agenda-pro/web
```

Resultado: **pass** (exit 0).

E2E `smoke-booking` permanece compatível: `#booking-date` mantido; botão “Ver horários” opcional (já tratado no spec); seleção de slot avança aos dados sem “Continuar”.

---

## Pendências / residual

1. **Probe de próxima vaga** faz até 14 requests sequenciais de `/slots` no client — aceitável para MVP; ideal seria endpoint `next-available` na API (fora de escopo deste agente).
2. **Reviews no funil** só na etapa serviço (reduz rolagem nas etapas seguintes) — não há carrossel/SSR de reviews.
3. **Sombras tokenizadas** nos cards do booking: migradas para `shadow-[var(--shadow-*)]` no escopo; residual de `rgba` em outras áreas do app fica com outros agentes.
4. **Sem teste visual Playwright** dedicado a 320px nesta entrega.

---

## Notas

- Consome DS do Agente 1: `Skeleton`, `useToast`, `EmptyState`, Lucide via `@/components/icons`.
- Identidade Graphite (ink / mint / brass / paper) preservada — sem purple/cream defaults.
- `ToastProvider` já no root (`AppProviders`); páginas públicas só chamam `useToast()`.
