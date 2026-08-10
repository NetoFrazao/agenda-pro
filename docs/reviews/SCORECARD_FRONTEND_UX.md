# SCORECARD — Frontend + UI/UX (ciclo produção)

**Data:** 2026-08-10  
**Branch:** `cursor/agent-frontend-r4`  
**Escopo:** `apps/web/src/**` (+ patch opcional `activeOnly` em list appointments) + este scorecard  
**Baseline Round 3:** FRONTEND 8.2 · UX 8.4 · composta 8.3  

---

## Nota honesta deste ciclo (Round 4)

| Dimensão | Antes | Depois | Comentário |
|----------|------:|-------:|------------|
| Frontend (contrato / bugs) | 8.2 | **8.4** | StatCard 7 dias não usa mais `total` bruto (que incluía cancelados) |
| UX / a11y | 8.4 | **8.7** | StarPicker teclado; focus trap compartilhado; cancel/remarcar em Modal; Field error= auth |
| Design system Graphite | 9.0 | **9.0** | Sem reabrir migração R3 |
| Ativação (produto) | 8.0 | **8.0** | Sem mudança |

**Nota composta do ciclo: 8.5 / 10**

Não é 9+: testes web ainda no-op; `User.role` tipagem formal fica com Backend AuthZ R4; total server-side “ativos” ainda depende de merge do patch `activeOnly`.

---

## Fixes entregues (Round 4)

### [Baixo] Teclado no `StarPicker`
- Roving `tabIndex` + ArrowLeft/Right/Up/Down, Home/End, Enter/Espaço no radiogroup de avaliação (`agendamento/[token]`).

### [Baixo] Focus trap em overlays além de Modal/menu
- Hook compartilhado `lib/useFocusTrap.ts` (`getFocusable` + trap Tab/Escape/restore/scroll).
- `Modal` e menu mobile do `DashboardShell` passam a usar o hook.
- Painéis de **cancelar** e **remarcar** (manage token) viraram `Modal` — passam a ter trap de foco.

### [Baixo] `Field error=` padronizado nos forms de auth
- Login, register, esqueci-senha e redefinir-senha: validação client + `Field error=`.
- Helper `lib/authFieldErrors.ts` mapeia mensagens Nest/401 para campos; Alert só para erros genéricos.

### [Baixo] StatCard 7 dias — só ativos (honesto no client)
- Contagem = itens da página **excluindo** `CANCELLED` / `NO_SHOW`.
- Se a lista está truncada (`total > pageSize`), o card mostra `N+` e hint “ativos nesta página” — **não** usa `appointmentsTotal` (que incluía cancelados).
- **Dependência Backend:** patch `activeOnly` em `GET /api/appointments` (DTO + lifecycle) está no worktree para total server-side fiel; até merge, o client permanece honesto.

### Lint
- `npm run lint -w @agenda-pro/web` — **OK (0 warnings / 0 errors)**

---

## Breaking / avisos (coordenação)

### Breaking (comportamento UI)
1. **StatCard “Próximos 7 dias”:** deixa de inflar com cancelados via `total` truncado. Com >100 itens no range, o valor vira `N+` (piso da página) em vez de um total bruto misturado.
2. **Cancelar / remarcar (manage token):** UI passa de painel inline para **dialog modal**.

### Avisos
1. Total exato server-side de ativos requer merge do query param `activeOnly` (arquivos API no worktree).
2. CSRF / AuthProvider / Graphite / SSR — **não reabertos**.

---

## Gaps restantes

1. Testes web (script ainda no-op)
2. Tipar `User.role` formalmente (Backend AuthZ)
3. Merge `activeOnly` para total paginado fiel no StatCard

---

## Arquivos tocados (principais)

- `apps/web/src/lib/useFocusTrap.ts` **(novo)**
- `apps/web/src/lib/authFieldErrors.ts` **(novo)**
- `apps/web/src/components/ui.tsx` / `DashboardShell.tsx`
- `apps/web/src/app/agendamento/[token]/page.tsx`
- `apps/web/src/app/{login,register,esqueci-senha,redefinir-senha}/page.tsx`
- `apps/web/src/app/dashboard/page.tsx`
- `apps/api/src/appointments/**` (`activeOnly` — patch mínimo, pending merge)
- `SCORECARD_FRONTEND_UX.md` (este)
