# SCORECARD — Frontend + UI/UX (ciclo produção)

**Data:** 2026-08-09  
**Escopo:** `apps/web/**` only  
**Baseline:** FRONTEND_REVIEW 6.0 · UX_REVIEW 7.2 · MEGA Fase 2 itens 6–7, 14  

---

## Nota honesta deste ciclo

| Dimensão | Antes | Depois | Comentário |
|----------|------:|-------:|------------|
| Frontend (contrato / bugs) | 6.0 | **7.4** | Paginação appointments, AuthGuard cookie-first, StatCard 7 dias |
| UX / a11y | 7.2 | **7.8** | Modal trap+Escape+restore; touch `sm`; muted; menu mobile trap |
| Ativação (produto mínimo) | ~4 | **6.5** | Empty state onboarding (serviço → `/u/slug`), sem wizard multi-step |

**Nota composta do ciclo: 7.5 / 10**

Não é 8+: páginas monólito, CSR-first, listbox de slots, DS `stone-*` legado e ausência de testes permanecem.

---

## Fixes entregues

### MEGA #6 — Appointments + StatCard
- `AppointmentListResponse` em `lib/types.ts`
- Agenda: `page` / `pageSize` / `total` + UI Anterior/Próxima (padrão clients)
- Dashboard: fetch tipado `page=1&pageSize=100`; contagem **não** usa `slice(0,6)`; preview separado; se truncado, usa `total` da API com copy honesta

### MEGA #5 / Frontend #4 — AuthGuard
- Sempre probe `/api/auth/me`
- `localStorage` só via `setSessionFlag` / `clearSessionFlag` após resultado do probe

### MEGA #14 / UX P01 — Modal
- Focus trap (Tab/Shift+Tab), Escape → `onClose`, foco inicial no painel, restore do opener, `body` scroll lock
- Menu mobile: trap + Escape restaura foco no botão Menu

### MEGA #7 / Product P-01 — Ativação mínima
- Empty state no dashboard se zero serviços ativos: CTA **Criar serviço** + **Abrir /u/{slug}**
- Empty da lista de próximos também aponta para serviço / página pública

### Touch / contraste (mesmo diff)
- `Button` `sm`: `min-h-11` (44px)
- `--color-muted-soft` elevado para `#6b736e` (AA em paper)
- Inputs: `focus-visible` + ring mint mais visível
- `StatCard` labels `text-xs` / `white/70` no accent

### Lint
- `npm run lint -w @agenda-pro/web` — OK (0 warnings)

---

## Segunda passagem a11y (pós-implementação)

| Check | Status |
|-------|--------|
| Modal: trap / Escape / restore | OK |
| Menu mobile: Escape + trap + restore | OK |
| Dialog `aria-modal` + `aria-labelledby` estável (`useId`) | OK |
| Touch targets CTAs dashboard / Button sm | OK (≥44px) |
| Contraste placeholders / labels StatCard | Melhorado |
| Listbox de horários (booking) | **Aberto** — fora deste ciclo |
| Focus trap em overlays além de Modal/menu | Parcial |
| `Field error=` em auth | Aberto |

---

## Gaps restantes (não neste diff)

1. **Listbox / StarPicker teclado** (UX P02, P12)  
2. **Migração Graphite** nas pages `stone-*` (services, billing, settings…)  
3. **SSR / `generateMetadata`** no booking público  
4. **Componentização** pages monólito + hooks compartilhados  
5. **AuthProvider** — `/me` ainda refetchado por página  
6. **Filtros de data no timezone do tenant**  
7. **Wizard pós-register multi-step** (só empty state)  
8. **Testes** web (script ainda no-op)  
9. **StatCard 7 dias truncado:** `total` da API inclui cancelados; ideal seria count server-side “ativos”

---

## Arquivos tocados

- `apps/web/src/lib/types.ts`
- `apps/web/src/components/DashboardShell.tsx`
- `apps/web/src/components/ui.tsx`
- `apps/web/src/app/globals.css`
- `apps/web/src/app/dashboard/page.tsx`
- `apps/web/src/app/dashboard/appointments/page.tsx`
- `SCORECARD_FRONTEND_UX.md` (este)
