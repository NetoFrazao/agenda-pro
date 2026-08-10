# SCORECARD — Frontend + UI/UX (ciclo produção)

**Data:** 2026-08-10  
**Branch:** `cursor/agent-frontend-r4`  
**Escopo:** `apps/web/src/**` (+ filtro mínimo `activeOnly` em list appointments) + este scorecard  
**Baseline Round 3:** FRONTEND 8.2 · UX 8.4 · composta 8.3  

---

## Nota honesta deste ciclo (Round 4)

| Dimensão | Antes | Depois | Comentário |
|----------|------:|-------:|------------|
| Frontend (contrato / bugs) | 8.2 | **8.4** | StatCard 7 dias usa `total` com `activeOnly` (sem cancelados/no-show) |
| UX / a11y | 8.4 | **8.7** | StarPicker teclado; focus trap compartilhado; cancel/remarcar em Modal; Field error= auth |
| Design system Graphite | 9.0 | **9.0** | Sem reabrir migração R3 |
| Ativação (produto) | 8.0 | **8.0** | Sem mudança |

**Nota composta do ciclo: 8.5 / 10**

Não é 9+: testes web ainda no-op; `User.role` tipagem formal fica com Backend AuthZ R4.

---

## Fixes entregues (Round 4)

### [Baixo] Teclado no `StarPicker`
- Roving `tabIndex` + ArrowLeft/Right/Up/Down, Home/End, Enter/Espaço no radiogroup de avaliação (`agendamento/[token]`).

### [Baixo] Focus trap em overlays além de Modal/menu
- Hook compartilhado `lib/useFocusTrap.ts` (`getFocusable` + trap Tab/Escape/restore/scroll).
- `Modal` e menu mobile do `DashboardShell` passam a usar o hook.
- Painéis de **cancelar** e **remarcar** (manage token) viraram `Modal` — passam a ter trap de foco (antes eram disclosures inline sem trap).

### [Baixo] `Field error=` padronizado nos forms de auth
- Login, register, esqueci-senha e redefinir-senha: validação client + `Field error=` (`aria-invalid` / `aria-describedby`).
- Helper `lib/authFieldErrors.ts` mapeia mensagens Nest/401 para campos quando há alvo claro; Alert de página só para erros genéricos.

### [Baixo] StatCard 7 dias — só ativos
- Query dashboard: `GET /api/appointments?...&activeOnly=true`.
- Backend (mínimo): `ListAppointmentsQueryDto.activeOnly` → `status: { notIn: [CANCELLED, NO_SHOW] }` no `total` e items.
- Hint do card deixa explícito “ativos”.

### Lint
- `npm run lint -w @agenda-pro/web` — **OK (0 warnings / 0 errors)** (2026-08-10).

---

## Breaking / avisos (coordenação)

### Breaking (comportamento UI)
1. **StatCard “Próximos 7 dias”:** o número **deixa de incluir** `CANCELLED` e `NO_SHOW` também quando a lista está truncada (`total` da API). Antes, no caminho truncado, o `total` bruto podia inflar o card. Expectativa alinhada ao filtro local e ao hint “ativos”.
2. **Cancelar / remarcar (manage token):** UI passa de painel inline para **dialog modal** (Escape fecha, foco preso no painel).

### Avisos (não breaking de tipo)
1. **`activeOnly` é opt-in** na listagem de appointments — agenda completa (`/dashboard/appointments`) continua sem o flag (mostra cancelados).
2. **`User.role` tipado** — ainda pode ser `string?` até merge do AuthZ R4; UI já faz cast.
3. **Auth Field errors:** 401 de login marca `password`; demais 4xx sem campo reconhecível seguem no `Alert`.
4. CSRF / AuthProvider / Graphite / SSR pública — **não reabertos** neste round.

### Sem mudança de contrato tipado obrigatória no web
- Novo query param opcional `activeOnly` (boolean) em `GET /api/appointments` — default ausente = comportamento anterior.

---

## Gaps restantes

1. Testes web (script ainda no-op / Playwright cobertura de fluxos)
2. Tipar `User.role` formalmente no contrato compartilhado (Backend AuthZ)
3. Tema claro/escuro (decisão consciente light-only — fora de escopo)

---

## Arquivos tocados (principais)

- `apps/web/src/lib/useFocusTrap.ts` **(novo)**
- `apps/web/src/lib/authFieldErrors.ts` **(novo)**
- `apps/web/src/components/ui.tsx` (Modal → useFocusTrap)
- `apps/web/src/components/DashboardShell.tsx`
- `apps/web/src/app/agendamento/[token]/page.tsx` (StarPicker + Modals)
- `apps/web/src/app/login/page.tsx` / `register/page.tsx` / `esqueci-senha/page.tsx` / `redefinir-senha/page.tsx`
- `apps/web/src/app/dashboard/page.tsx` (`activeOnly`)
- `apps/api/src/appointments/dto/appointment.dto.ts` / `appointment-lifecycle.service.ts` / controller + facade + spec
- `SCORECARD_FRONTEND_UX.md` (este)
