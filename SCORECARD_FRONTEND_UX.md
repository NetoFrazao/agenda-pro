# SCORECARD — Frontend + UI/UX (ciclo produção)

**Data:** 2026-08-09  
**Branch:** `cursor/agent-frontend`  
**Escopo:** `apps/web/src/**` (+ este scorecard)  
**Baseline ciclo anterior:** FRONTEND 7.4 · UX 7.8 · composta 7.5  

---

## Nota honesta deste ciclo

| Dimensão | Antes | Depois | Comentário |
|----------|------:|-------:|------------|
| Frontend (contrato / bugs) | 7.4 | **8.2** | AuthProvider único; filtros de data no TZ do tenant; SSR metadata pública |
| UX / a11y | 7.8 | **8.4** | SlotListbox teclado; wizard onboarding; empty/CRM gate para MEMBER |
| Design system Graphite | ~6 | **9.0** | `stone-*` removido das pages; hex/teal legados → tokens ink/mint/line |
| Ativação (produto) | 6.5 | **8.0** | Wizard 3 passos (serviço → horários → compartilhar) |

**Nota composta do ciclo: 8.3 / 10**

Não é 9+: testes web ainda no-op; StarPicker teclado aberto; `User.role` ainda `string?` no contrato tipado.

---

## Fixes entregues (backlog)

### [Alto] Migração Graphite — `stone-*`
- Removidas utilidades `stone-*` remanescentes em dashboard (services, billing, settings, team, waitlist, availability, reports, reviews), legal (termos/privacidade) e booking.
- Hex ad-hoc (`#6b736e`, `#d5dbd6`, …) e `teal-*` de UI → tokens Graphite (`muted`, `line`, `mint-deep`, `success-bg`).
- Surfaces legadas `rounded-lg … ring-stone` → `surface-elevated rounded-2xl` onde aplicável.

### [Alto] Componentização monólitos
- `dashboard/page.tsx`: `UpcomingList` + `OnboardingWizard` + dados via `useAuth`.
- `dashboard/appointments/page.tsx`: `AppointmentFilters`, `AppointmentCard`, `RebookingBanner`.
- Novo `SlotListbox` compartilhado (booking público + remarcar).

### [Médio] AuthProvider centralizado
- `components/AuthProvider.tsx` + `useAuth()`; shell faz um único `/api/auth/me`.
- Pages (dashboard, agenda, clients, reviews, billing, settings, reports) consomem contexto — sem probe duplicado.
- Nav MEMBER: esconde itens `ownerOnly` (clientes, serviços, equipe, relatórios, planos).

### [Médio] Listbox de horários (a11y)
- Setas, Home/End, Enter/Espaço, roving `tabIndex`, `aria-activedescendant`.

### [Médio] Filtros de data no timezone do tenant
- Helpers em `lib/format.ts`: `todayYmdInTimeZone`, `ymdInTimeZone`, `addDaysYmd`, `zonedWallTimeToIso`, `zonedDayBoundsIso`, `firstDayOfMonthYmdInTimeZone`.
- Agenda, dashboard (janela 7 dias / “hoje”) e relatórios usam bounds no fuso do tenant, não `Date` local do browser.

### [Médio] Wizard pós-cadastro
- `OnboardingWizard`: 3 passos com progressão e dismiss em `localStorage`.

### [Baixo] SSR / `generateMetadata` em `/u/[slug]`
- `page.tsx` server: `generateMetadata` + fetch público (revalidate 60s).
- UI em `PublicBookingClient.tsx` (CSR do fluxo de booking).

### Lint
- `npm run lint -w @agenda-pro/web` — **OK (0 warnings / 0 errors)**

---

## Breaking / avisos (coordenação)

### Breaking (comportamento UI)
1. **Nav MEMBER filtrada:** itens CRM/owner some do menu. Deep-link em `/dashboard/clients` mostra empty state “Acesso restrito”. Depende de Agente 1 garantir `user.role` em `/auth/me` e filtro server-side de appointments.
2. **Filtros de data:** ISO enviados à API passam a ser meia-noite/fim-do-dia **no TZ do tenant**. Ranges podem mudar ±1 dia vs browser em fusos distantes — esperado e desejado.

### Avisos (não breaking de tipo)
1. **`lib/types.ts` `User.role` permanece `string?`** — UI faz cast para `OWNER | MEMBER`. Se Agente 1 tipar formalmente `role: UserRole`, alinhar (melhoria, não exigido neste diff para evitar drift).
2. **CRM clients:** UI pronta para MEMBER empty; se API ainda devolver 403, empty cobre; se devolver dados sem filtro, é gap de backend (Agente 1).
3. **AuthProvider `requireAuth`:** um refresh de sessão no shell; `refresh()` em billing pode revalidar — não duplica probe por page mount.
4. **Onboarding:** dismiss local; não sincroniza com backend. Wizard só para não-MEMBER.
5. **StatCard 7 dias:** `total` da API ainda pode incluir cancelados se o backend não filtrar — aviso herdado.

### Sem mudança de contrato tipado
- Nenhum campo novo obrigatório em `AppointmentListResponse` / payloads de booking.

---

## Gaps restantes

1. StarPicker teclado (UX P12)  
2. Testes web (script ainda no-op)  
3. Focus trap em overlays além de Modal/menu  
4. `Field error=` em auth forms  
5. Count server-side “ativos” para StatCard 7 dias  

---

## Arquivos tocados (principais)

- `apps/web/src/components/AuthProvider.tsx` **(novo)**
- `apps/web/src/components/SlotListbox.tsx` **(novo)**
- `apps/web/src/components/OnboardingWizard.tsx` **(novo)**
- `apps/web/src/components/DashboardShell.tsx`
- `apps/web/src/lib/format.ts`
- `apps/web/src/app/dashboard/page.tsx`
- `apps/web/src/app/dashboard/appointments/page.tsx`
- `apps/web/src/app/dashboard/{clients,reports,reviews,billing,settings}/**`
- `apps/web/src/app/u/[slug]/page.tsx` + `PublicBookingClient.tsx` **(novo)**
- `apps/web/src/app/agendamento/[token]/page.tsx`
- Pages Graphite: services, team, waitlist, availability, termos, privacidade, planos, auth pages, `ui.tsx`, `pix.tsx`
- `SCORECARD_FRONTEND_UX.md` (este)
