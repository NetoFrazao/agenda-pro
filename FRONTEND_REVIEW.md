# FRONTEND_REVIEW — Agenda Pro (`apps/web`)

**Data:** 2026-08-09  
**Escopo:** `apps/web/**` (Next.js 15 App Router + React 19)  
**Método:** leitura estática de páginas, `lib/*`, shells e contraste com contrato da API (`apps/api` appointments paginado)  
**Nota geral:** **6.0 / 10**

---

## Resumo executivo

O frontend entrega um MVP utilizável: cliente HTTP com refresh/401, tipos locais razoáveis, design system em `components/ui.tsx` e shells de auth/dashboard. A arquitetura, porém, é quase 100% CSR (`'use client'` em praticamente todas as rotas), com páginas monólito (booking público ~816 linhas, CRM ~707), sem `loading.tsx`/`error.tsx`, sem hooks compartilhados e com **drift de contrato** na listagem de appointments (API paginada; UI ainda trata array legado e ignora `total`/`page`).

---

## Top 5 (prioridade)

1. **Appointments: resposta paginada da API não modelada nem paginada na UI** — truncamento silencioso (>100 itens).
2. **Páginas monólito CSR** (`u/[slug]`, `clients`, `agendamento/[token]`, `settings`) — zero componentização de domínio.
3. **Booking/manage públicos 100% client-side** — sem SSR/RSC nem `generateMetadata` por tenant (SEO/share/LCP).
4. **AuthGuard depende de flag `localStorage` antes do cookie** — sessão httpOnly válida pode ser rejeitada.
5. **Métrica “Próximos 7 dias” no dashboard usa lista já `slice(0, 6)`** — número incorreto.

---

## Problemas

### 1. Contrato de appointments paginado não adotado de ponta a ponta

- **Gravidade:** ALTO  
- **Categoria:** Frontend  
- **Localização:** `apps/web/src/app/dashboard/appointments/page.tsx`, `apps/web/src/app/dashboard/page.tsx`, `apps/web/src/lib/types.ts`  
- **Problema:** A API documenta breaking change: lista deixa de ser array e passa a `{ items, total, page, pageSize }` (default `pageSize=100`, max 100). O web tipa `Appointment[] | { items: Appointment[] }`, extrai só `items`, **não envia `page`/`pageSize`**, **não lê `total`** e não oferece UI de paginação.  
- **Evidência:**  
  - API: `appointments.service.ts` — `return { items, total, page, pageSize }` + comentário “Breaking”.  
  - Web: `api<Appointment[] | { items: Appointment[] }>(...)` + `Array.isArray(data) ? data : (data?.items ?? [])`.  
  - `types.ts` tem `ClientListResponse` paginado, mas **não** há `AppointmentListResponse`.  
- **Impacto:** Agenda e dashboard podem omitir agendamentos além da 1ª página sem aviso; métricas “hoje” / “próximos 7 dias” ficam subcontadas em tenants ocupados.  
- **Proposta:** Tipar `AppointmentListResponse`; sempre consumir `{ items, total, page, pageSize }`; paginar (ou pedir `pageSize` adequado + “carregar mais”); remover união com array legado.

---

### 2. Páginas gigantes sem camadas de componentes/hooks

- **Gravidade:** ALTO  
- **Categoria:** Frontend  
- **Localização:**  
  - `apps/web/src/app/u/[slug]/page.tsx` (~816 linhas)  
  - `apps/web/src/app/dashboard/clients/page.tsx` (~707)  
  - `apps/web/src/app/agendamento/[token]/page.tsx` (~486)  
  - `apps/web/src/app/dashboard/settings/page.tsx` (~478)  
- **Problema:** Fluxos inteiros (wizard de booking, CRM detalhe+lista, manage appointment, settings multi-form) vivem em um único default export de page, com dezenas de `useState` e handlers inline. Não há pasta `hooks/`, features ou componentes de domínio além de UI genérica / shells.  
- **Evidência:** Contagem de linhas em `apps/web/src`; `components/` só tem `ui`, `DashboardShell`, `AuthShell`, `SiteChrome`, `BrandLogo`, `pix`.  
- **Impacto:** Difícil testar, revisar e evoluir; regressões fáceis; onboarding de novos devs lento.  
- **Proposta:** Extrair por feature (`booking/`, `clients/`, `manage-appointment/`); hooks `usePublicProfile`, `useSlots`, `useClientList`; manter pages como composição fina.

---

### 3. App Router usado como SPA: CSR quase total, sem boundaries

- **Gravidade:** ALTO  
- **Categoria:** Frontend  
- **Localização:** Todas as pages sob `apps/web/src/app/**` (exceto layouts estáticos/legais com `metadata`); ausência de `loading.tsx` / `error.tsx` / `not-found.tsx`  
- **Problema:** Next 15 App Router está presente, mas o valor de RSC/SSR não é usado nas rotas críticas. Booking público e manage token fazem fetch só no `useEffect` após hidratação. Não há route-level error/loading boundaries.  
- **Evidência:** `'use client'` no topo de dashboard, login, register, `u/[slug]`, `agendamento/[token]`, etc.; glob zero para `loading.tsx`/`error.tsx`.  
- **Impacto:** Pior TTFB/LCP e SEO no link público (`/u/[slug]`); share cards genéricos (só metadata global do `layout.tsx`); falhas de fetch viram spinner/alert ad hoc inconsistente.  
- **Proposta:** Server Component para perfil público + `generateMetadata({ params })`; client islands só no wizard; adicionar `error.tsx`/`loading.tsx` no dashboard e nas rotas públicas.

---

### 4. AuthGuard: flag de UX bloqueia cookie httpOnly válido

- **Gravidade:** ALTO  
- **Categoria:** Frontend  
- **Localização:** `apps/web/src/components/DashboardShell.tsx` (`AuthGuard`), `apps/web/src/lib/auth.ts`  
- **Problema:** Comentários admitem que a autoridade é o cookie, mas o guard **redireciona para `/login` se `hasSession()` (localStorage) for falso**, sem tentar `/api/auth/me`.  
- **Evidência:**

```38:41:apps/web/src/components/DashboardShell.tsx
      if (!hasSession()) {
        router.replace('/login');
        return;
      }
```

- **Impacto:** Limpar storage, outro browser profile, ou race pós-login pode expulsar usuário com cookies ainda válidos; inconsistência com o modelo “sessão = httpOnly”.  
- **Proposta:** Sempre probe `/api/auth/me` (ou middleware Next + cookie); usar `localStorage` só como hint otimista, nunca como gate hard.

---

### 5. Dashboard: card “Próximos 7 dias” conta lista já fatiada

- **Gravidade:** MÉDIO  
- **Categoria:** Frontend  
- **Localização:** `apps/web/src/app/dashboard/page.tsx`  
- **Problema:** `upcoming` aplica `.slice(0, 6)` e em seguida o `StatCard` usa `upcoming.length` como valor de “Próximos 7 dias”.  
- **Evidência:** filtro → sort → `slice(0, 6)` → `value={upcoming.length}`.  
- **Impacto:** Com ≥7 agendamentos no período, o card mostra **6** em vez do total real.  
- **Proposta:** Separar `upcomingAll` (contagem) de `upcomingPreview` (slice para a lista).

---

### 6. Tipos defensivos `T | Array` espalhados (contrato incerto)

- **Gravidade:** MÉDIO  
- **Categoria:** Frontend  
- **Localização:** appointments, dashboard, `u/[slug]` slots (`string[] | PublicSlotsResponse`), vários `Array.isArray(data) ? data : []`  
- **Problema:** Uniões legadas mascaram breaking changes e impedem falha cedo em TypeScript. Clients já usa `ClientListResponse` corretamente; appointments/slots não.  
- **Evidência:** Grep `Array.isArray(data)` / `Appointment[] | { items` / `string[] | PublicSlotsResponse`.  
- **Impacto:** Bugs silenciosos quando a forma da resposta muda; duplicação de normalizers.  
- **Proposta:** Um tipo por endpoint; normalizers únicos em `lib/api` ou mappers; alinhar OpenAPI/shared package se existir no monorepo.

---

### 7. `/api/auth/me` repetido em quase toda página do dashboard

- **Gravidade:** MÉDIO  
- **Categoria:** Frontend  
- **Localização:** `DashboardShell` (AuthGuard) + `dashboard/page`, `appointments`, `clients`, `settings`, `billing`, `reviews`  
- **Problema:** Sem contexto/provider de sessão: cada page refetcha `me` só para timezone/nome/plano.  
- **Evidência:** Múltiplas chamadas `api<AuthUserPayload>('/api/auth/me')` além do probe do shell.  
- **Impacto:** Latência extra, waterfall, estado de tenant inconsistente entre telas.  
- **Proposta:** `AuthProvider` / React cache / RSC layout que passa `me` via context após um único fetch.

---

### 8. Filtros de data com `Date('YYYY-MM-DDT00:00:00').toISOString()` no fuso do browser

- **Gravidade:** MÉDIO  
- **Categoria:** Frontend  
- **Localização:** `appointments/page.tsx`, `reports/page.tsx` (padrão similar)  
- **Problema:** Range “civil” do input date é convertido via timezone local do browser, não do `tenant.timezone`.  
- **Evidência:** `new Date(\`${rangeFrom}T00:00:00\`).toISOString()` + timezone do tenant só usado em `formatDateTime`.  
- **Impacto:** Bordas de dia erradas para profissionais em outro fuso ou browser vs negócio.  
- **Proposta:** Construir limites no timezone do tenant (lib dedicada ou API aceitando `dateKey` + timezone).

---

### 9. Ausência de testes e script de test no-op

- **Gravidade:** MÉDIO  
- **Categoria:** Frontend  
- **Localização:** `apps/web/package.json` → `"test": "echo \"No web tests in Phase 1\""`  
- **Problema:** Zero testes de componentes, hooks ou fluxos (booking, auth guard, paginação).  
- **Impacto:** Refactors das páginas monólito são arriscados; regressões de contrato API passam despercebidas.  
- **Proposta:** Vitest/RTL nos mappers e no cliente `api`; Playwright smoke em `/u/[slug]` e login→agenda.

---

### 10. UI kit monolítico e inconsistência visual pontual

- **Gravidade:** BAIXO  
- **Categoria:** Frontend  
- **Localização:** `apps/web/src/components/ui.tsx` (~379 linhas); `reports/page.tsx` usa `ring-stone-200` / `bg-white/80` fora do padrão `surface-elevated`  
- **Problema:** Todo o DS em um arquivo; algumas pages fogem dos tokens.  
- **Impacto:** Manutenção e tree-shaking piores; UI inconsistente.  
- **Proposta:** Partir `ui/` por primitivo; padronizar surfaces.

---

### 11. Manage appointment: slots tipados só como objeto (booking aceita união)

- **Gravidade:** BAIXO  
- **Categoria:** Frontend  
- **Localização:** `agendamento/[token]/page.tsx` vs `u/[slug]/page.tsx`  
- **Problema:** Public booking normaliza `string[] | PublicSlotsResponse`; manage assume `res.slots`. Se a API ainda devolver array, manage mostra lista vazia.  
- **Evidência:** `setSlots(res.slots || [])` sem `Array.isArray`.  
- **Impacto:** Remarcação quebrada sob forma legada de resposta.  
- **Proposta:** Mesmo helper `normalizeSlots(data)` nas duas rotas.

---

## Pontos positivos

- Cliente `api()` com credentials, refresh único e `ApiError` tipado (`lib/api.ts`).  
- `types.ts` amplo e alinhado a vários domínios (CRM, PIX, reports, public book).  
- Shells (`DashboardShell`, `AuthShell`, `SiteChrome`) e primitives (`Spinner`, `EmptyState`, `Alert`, `StatusBadge`) dão base de UX.  
- Clients page já consome paginação corretamente (`ClientListResponse` + UI de páginas) — padrão a replicar em appointments.  
- Tratamento de 409 no booking/remarcação (corrida de slot) é consciente.

---

## Critérios da nota (0–10)

| Critério | Peso | Nota | Comentário |
|----------|------|------|------------|
| Componentização / modularidade | 20% | 4 | Pages monólito; poucos componentes de domínio |
| Estado / hooks | 15% | 5 | useState local repetido; sem data layer |
| Fetch / API client | 15% | 7 | Bom client; falta tipagem rígida pós-breaking |
| SSR/CSR / App Router | 15% | 4 | CSR-first; metadata só global |
| Tipos / contrato API | 15% | 6 | Bom arquivo de tipos; drift appointments/slots |
| Error / loading UX | 10% | 6 | Ad hoc ok; sem boundaries Next |
| Escalabilidade / dívida | 10% | 5 | MVP ok; CRM/booking não escalam em manutenção |

**Média ponderada ≈ 6.0**

---

## Roadmap sugerido (só documentação — sem implementar aqui)

1. Fechar contrato appointments (tipos + paginação UI + dashboard counts).  
2. Corrigir AuthGuard e StatCard “7 dias”.  
3. Quebrar `u/[slug]` e `clients` em features + hooks.  
4. RSC + `generateMetadata` no booking público.  
5. `AuthProvider` + eliminar N× `/auth/me`.  
6. Testes smoke Playwright nos fluxos críticos.
