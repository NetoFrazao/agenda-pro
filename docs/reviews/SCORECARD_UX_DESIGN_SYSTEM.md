# SCORECARD — UX Design System (Agenda Pro)

| Campo | Valor |
|-------|--------|
| **Data** | 2026-08-10 |
| **Branch** | `cursor/agent-ux-design-system` |
| **Base** | `cursor/saas-hardening-crm-infra` @ `8d82631` |
| **Escopo** | Tokens Graphite, `ui`/`Toast`/`Skeleton`, Lucide, tipografia, elevação, favicon/OG |
| **Nota inicial (fundação)** | **8.2 / 10** |
| **Nota atual** | **9.1 / 10** |
| **Veredito** | Design system Graphite fechado para consumo pelos Agentes 2–3: tokens sem hex soltos no escopo compartilhado, Toast/Skeleton exportados, Lucide canônico, tipografia/elevação formalizadas, metadata visual. |

Critério: 10 = tokens únicos, primitivos reutilizáveis, ícones únicos, tipografia/elevação documentadas em CSS, metadata pronta; residual só em páginas fora do ownership.

---

## Backlog

| # | Prioridade | Item | Status |
|---|------------|------|--------|
| 1 | Alto | Audit tokens — zero `stone-*` / hex soltos no escopo | ✅ |
| 2 | Alto | `lucide-react` + ícones canônicos nos compartilhados | ✅ |
| 3 | Alto | `Toast` (sucesso/erro) + `Skeleton` (lista/card) | ✅ |
| 4 | Médio | Escala tipográfica Syne / DM Sans | ✅ |
| 5 | Médio | Elevação/sombra consistente | ✅ |
| 6 | Baixo | Favicon + `og:image` | ✅ |

---

## O que exportar (Agentes 2–3)

```ts
// Preferência: barrel
import {
  Button, Modal, Alert, EmptyState,
  Skeleton, SkeletonCard, SkeletonList, PageSkeleton,
  Toast, ToastProvider, useToast,
  icons, iconSize,
} from '@/components';

// Ou caminhos diretos
import { useToast } from '@/components/Toast';
import { Check, X, Menu } from '@/components/icons';
import { SkeletonList, SkeletonCard } from '@/components/ui';
```

| API | Uso |
|-----|-----|
| `useToast().success(title, desc?)` / `.error(...)` | Feedback pós-ação (salvar, falha API) |
| `<Toast tone title description />` | Toast estático / story |
| `Skeleton` / `SkeletonCard` / `SkeletonList` / `PageSkeleton` | Loading states |
| `@/components/icons` | Ícones Lucide canônicos (não SVG solto) |
| `.type-display-*` / `.type-body-*` / `.type-overline` | Hierarquia tipográfica |
| `.surface` / `.surface-elevated` / `.surface-dropdown` + `shadow-*` tokens | Elevação |
| `AppProviders` | Já no `layout.tsx` — Toast global disponível |

---

## Tokens / audit

### Escopo compartilhado (corrigido)
- Hex de hover primary (`#0b5f58`) → `--color-mint-hover`
- EmptyState dashed (`#c9d0cb`) → `--color-line-soft`
- Atmosphere / ink-stage gradients → `--color-paper-*` / `--color-ink-mid`
- Sombras inline → `--shadow-primary`, `--shadow-inset-control`, `--shadow-toast`, `--shadow-dropdown`, `--shadow-slot`
- Badges / Alert / PIX: `sky`/`amber`/`red` Tailwind → tokens `info` / `warning` / `danger` / `success`
- `stone-*`: **0 ocorrências** em `apps/web` no tip atual (já migrado antes deste agente)

### Páginas ainda com legado (para Agentes 2/3 — **não editadas**)

| Área | Arquivo(s) | Legado |
|------|------------|--------|
| Marketing | `app/page.tsx` | `bg-[#0b0d0c]/60`, sombras `rgba(...)` soltas no hero |
| Planos | `app/planos/page.tsx` | sombra `rgba` no card destacado |
| Booking | `app/u/[slug]/PublicBookingClient.tsx` | sombras `rgba` em chips/cards |
| Manage | `app/agendamento/[token]/page.tsx` | `text-amber-*` no StarPicker |
| Dashboard | `waitlist`, `team`, `settings`, `billing`, `clients` | `emerald-*` / `orange-*` / `red-*` pontuais (não `stone-*`) |

---

## Arquivos tocados

- `apps/web/package.json` (+ lock) — `lucide-react`
- `apps/web/src/app/globals.css` — tokens, type scale, elevation, toast motion
- `apps/web/src/app/layout.tsx` — metadata OG/Twitter + `AppProviders`
- `apps/web/src/app/icon.tsx` / `apple-icon.tsx` / `opengraph-image.tsx` — **novos**
- `apps/web/src/components/ui.tsx` — tokens, Lucide, SkeletonCard/List, re-export Toast
- `apps/web/src/components/Toast.tsx` — **novo**
- `apps/web/src/components/icons.ts` — **novo**
- `apps/web/src/components/AppProviders.tsx` — **novo**
- `apps/web/src/components/index.ts` — **novo** barrel
- `apps/web/src/components/DashboardShell.tsx` — Menu/X/LogOut
- `apps/web/src/components/pix.tsx` — warning tokens + Copy icon

---

## Testes

```text
npm run lint -w @agenda-pro/web
```

(resultado no commit / entrega)

---

## Notas

- Identidade Graphite preservada (ink / mint / brass / paper) — sem purple/cream defaults.
- Touch targets: botões base `min-h-11`, toast dismiss / modal close / menu mobile usam `.touch-target` (44px).
- `ToastProvider` montado no root; Agente 2/3 só chama `useToast()`.
- Sem push nesta entrega.
