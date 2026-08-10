# SCORECARD — UX Audit Final (Consistência & Acessibilidade Visual)

| Campo | Valor |
|-------|--------|
| **Data** | 2026-08-10 |
| **Branch** | `cursor/agent-ux-audit` |
| **Base** | `cursor/saas-hardening-crm-infra` @ `74b57b9` |
| **Escopo** | Ajustes pontuais cross-área (tokens, DS, booking, manage, dashboard shell, marketing/auth) |
| **Nota inicial** | **8.4 / 10** |
| **Nota atual** | **9.0 / 10** |
| **Veredito** | Contraste AA no paper/ink, foco unificado (`.focus-ring`), date chips com teclado, copy “agendamento” alinhada cliente↔e-mails; residual em mock marketing e smoke E2E teclado. |

Critério: 10 = WCAG AA em texto informativo Graphite, foco único em interativos, ícone-só com nome acessível, teclado no funil público sem gaps óbvios, tom visual alinhado cliente/dono.

---

## Backlog

| # | Prioridade | Item | Status |
|---|------------|------|--------|
| 1 | Alto | Contraste WCAG AA (texto paper, badges, erro/sucesso) | ✅ |
| 2 | Alto | Cliente vs dono — mesma linguagem visual/tom | ✅ (pontual) |
| 3 | Médio | Foco visível consistente | ✅ |
| 4 | Médio | Labels ARIA em botões só-ícone | ✅ |
| 5 | Baixo | Fluxo agendamento só teclado | ✅ (gaps óbvios) |

---

## Fixes entregues

### [Alto] Contraste WCAG AA
- `--color-muted` / `--color-muted-soft`: `#6b736e` (≈4.49) → `#646c67` (≥4.9:1 em paper).
- Auth / marketing / footer escuros: opacidades `white/30–55` informativas elevadas para ≥ `white/55–70`.
- Badge: `text-[11px]` → `text-xs` (legibilidade).
- Planos featured: removido `text-mint` dentro de badge success (falhava AA no fundo claro).
- Date chip selecionado: hint `text-mint` → `text-mint-glow` (melhor em ink).
- Link manage em painel ink: `text-mint` → `text-mint-glow`.
- StarPicker vazio: `text-line` → `text-muted`.

### [Alto] Cliente vs dono
- Manage: “Seu horário com…” → “Seu agendamento com…”; “Manter horário” → “Manter agendamento”.
- Confirmação / PIX notes: “agendamento” onde era confirmação do booking (alinhado ao Agente e-mails).
- Mock hero WhatsApp: “Seu agendamento…”.
- StatusBadge / tokens Graphite já compartilhados — sem reescrita de fluxo.

### [Médio] Foco visível
- Utilitário `.focus-ring` em `globals.css` (ring mint + offset paper, sem outline duplo).
- Aplicado em `Button`, Toast dismiss, Modal close, SlotListbox, date chips, step pills, cards booking, nav dashboard, BrandLogo, SiteHeader, OnboardingWizard, CRM list/tag.

### [Médio] ARIA ícone-só
- Menu mobile: `aria-label` Abrir/Fechar menu.
- BrandLogo link: `aria-label="Agenda Pro"`.
- Onboarding steps: `aria-label` por passo.
- Close menu / Toast / Modal já tinham labels — reforço de foco.

### [Baixo] Teclado no booking
- Novo `DateChipListbox`: roving tabindex + setas / Home / End / Enter / Espaço (paridade com `SlotListbox`).
- Step atual deixa de ficar `disabled` (permanece focável com `aria-current`).

---

## Arquivos tocados (principais)

- `apps/web/src/app/globals.css`
- `apps/web/src/components/ui.tsx` / `Toast.tsx` / `SlotListbox.tsx` / `DateChipListbox.tsx` **(novo)** / `index.ts`
- `apps/web/src/components/AuthShell.tsx` / `SiteChrome.tsx` / `BrandLogo.tsx` / `DashboardShell.tsx` / `OnboardingWizard.tsx`
- `apps/web/src/app/u/[slug]/PublicBookingClient.tsx`
- `apps/web/src/app/agendamento/[token]/page.tsx`
- `apps/web/src/app/page.tsx` / `planos/page.tsx`
- `apps/web/src/app/dashboard/clients/page.tsx`
- `docs/reviews/SCORECARD_UX_AUDIT.md` (este)

---

## Testes

```text
npm run lint -w @agenda-pro/web
```

---

## Residual

1. Hero mock “Hoje / 8 horários” — “horários” no sentido de slots; OK semanticamente.
2. Copy operacional do dono ainda usa “horário(s)” para slots do dia (dashboard) — intencional vs “agendamento” no lado cliente/e-mail.
3. Sem Playwright dedicado a teclado E2E neste ciclo.
4. Marketing `bg-[#0b0d0c]/60` / sombras rgba soltas — fora do critério AA de texto; residual visual DS.
5. `Button` disabled / placeholders muted-soft: contraste de estado desabilitado permanece secundário (não exige AA pleno).
