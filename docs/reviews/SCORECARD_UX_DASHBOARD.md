# SCORECARD — UX Dashboard (Experiência do Dono)

| Campo | Valor |
|-------|--------|
| **Data** | 2026-08-10 |
| **Branch** | `cursor/agent-ux-dashboard` |
| **Base** | `cursor/saas-hardening-crm-infra` @ `5fcba31` |
| **Escopo** | `apps/web/src/app/dashboard/**`, `DashboardShell` |
| **Nota inicial** | **7.4 / 10** |
| **Nota atual** | **8.6 / 10** |
| **Veredito** | Home prioriza dia + caixa/ocupação; páginas do painel alinhadas a Graphite; empty states acionáveis; nav mobile em drawer agrupado; skeletons na agenda/clientes. |

Critério: 10 = hierarquia operacional clara, tokens Graphite sem deriva Tailwind solta, empty/loading consistentes, nav mobile usável, copy de negócio — residual só fora do escopo (booking, DS base).

---

## Backlog

| # | Prioridade | Item | Status |
|---|------------|------|--------|
| 1 | Alto | Hierarquia da home: próximos do dia + faturamento/ocupação primeiro | ✅ |
| 2 | Alto | Consistência visual Graphite (emerald/orange/red soltos → tokens) | ✅ |
| 3 | Médio | Empty states acionáveis | ✅ |
| 4 | Médio | Nav mobile do dashboard | ✅ |
| 5 | Médio | Skeleton nas listas (agenda, clientes) | ✅ |
| 6 | Baixo | Copy direta de negócio | ✅ |

---

## Entregas

### Home (`dashboard/page.tsx`)
- Seção **Hoje** (lista) acima dos cards.
- Cards: Hoje · Faturamento do mês · Ocupação do mês (concluídos/agendados) · Próximos 7 dias.
- Em seguida: link público + **Próximos dias**.
- Empty states com CTA (serviço / página pública / agenda).

### Shell (`DashboardShell.tsx`)
- Top bar mobile sticky com página atual.
- Drawer full-height (focus trap + `inert` fechado).
- Nav agrupada: Principal / Operação / Conta.

### Consistência + empty/loading
- Removidos `emerald-*` / `orange-*` / `red-*` / `accent-emerald-*` soltos no dashboard → `mint` / `warning` / `danger`.
- Empty states com ação em agenda, clientes, serviços, reports, billing, waitlist, team, availability, reviews.
- `SkeletonList` em agenda e clientes; copy de segmento sem jargão de API.

---

## Arquivos tocados

- `apps/web/src/app/dashboard/page.tsx`
- `apps/web/src/components/DashboardShell.tsx`
- `apps/web/src/app/dashboard/appointments/page.tsx`
- `apps/web/src/app/dashboard/clients/page.tsx`
- `apps/web/src/app/dashboard/services/page.tsx`
- `apps/web/src/app/dashboard/reports/page.tsx`
- `apps/web/src/app/dashboard/billing/page.tsx`
- `apps/web/src/app/dashboard/waitlist/page.tsx`
- `apps/web/src/app/dashboard/team/page.tsx`
- `apps/web/src/app/dashboard/settings/page.tsx`
- `apps/web/src/app/dashboard/availability/page.tsx`
- `apps/web/src/app/dashboard/reviews/page.tsx`
- `docs/reviews/SCORECARD_UX_DASHBOARD.md` (este)

---

## Testes

```text
npm run lint -w @agenda-pro/web
```

---

## Pendências

1. Occupancy = proxy `completed/appointments` do summary mensal (sem capacidade de slots na API).
2. Skeleton estrutural nas demais listas (team/services/waitlist) — só Spinner.
3. Agrupamento nav: labels “Principal/Operação/Conta” podem ser refinados com ícones Lucide (opcional).
4. Fora de escopo: booking público, globals/ui base (Agente DS).
