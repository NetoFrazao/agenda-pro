# UX / a11y Review — Agenda Pro (Agente 7)

**Escopo:** design system Graphite, fluxos booking (`/u/[slug]`, `/agendamento/[token]`), dashboard, CRM (`/dashboard/clients`), auth · WCAG · mobile  
**Método:** inspeção estática de componentes/CSS (sem alteração de código de produto)  
**Data:** 2026-08-09  

---

## Nota geral: **7.2 / 10**

Fundação Graphite sólida (tokens, tipografia Syne + DM Sans, `:focus-visible`, `prefers-reduced-motion`, `Field`/`Alert`/`EmptyState`/`PageSkeleton`). Fluxos críticos de booking e auth estão usáveis e em geral acessíveis. Pontos que puxam a nota: modal sem trap de foco, `listbox` sem padrão de teclado, inconsistência visual Graphite vs `stone-*`, contraste em textos muted/hero e alvos de toque abaixo de 44px.

---

## Top 5

1. **Modal sem focus trap / Escape / restore** — bloqueia WCAG 2.1.2 e 2.4.3 em Equipe e demais diálogos.
2. **Seleção de horários (`role="listbox"`) sem teclado ARIA** — setas/Home/End e foco único ausentes no booking e remarcação.
3. **Design system partido** — páginas dashboard legadas em `stone-*` / `rounded-lg` vs `surface-elevated` / tokens ink–mint.
4. **Contraste insuficiente** — `--color-muted-soft`, `text-white/30–45`, labels `text-[11px]` + muted em fundos claros/escuros.
5. **Touch / densidade mobile** — `Button` `sm` (`min-h-9`), chips de step com label oculto, nav com 11 itens e drawer sem trap de foco.

---

## Pontos fortes (evidência)

| Área | Evidência |
|------|-----------|
| Tokens Graphite | `globals.css` `@theme`: ink / mint / brass / paper, raios, sombras, z-index, motion |
| Foco global | `:focus-visible { outline: 2px solid var(--color-mint-deep) }` |
| Reduced motion | `@media (prefers-reduced-motion: reduce)` zera animações/transições |
| Touch token | `--touch-min: 2.75rem` + utilitário `.touch-target` |
| Formulários | `Field` liga `htmlFor`, `aria-invalid`, `aria-describedby`, erro com `role="alert"` |
| Loading a11y | `Spinner` (`role="status"`), `PageSkeleton` (`role="status"` + `sr-only`) |
| Booking | Stepper com `aria-current="step"`, seções `aria-labelledby`, confirmação `aria-live="polite"` |
| Avaliação | `StarPicker` / `Stars` com `radiogroup` / `role="img"` + labels |
| Shells | `DashboardShell` Escape no menu, `aria-expanded`/`aria-controls`; `AuthShell` marca e hierarquia claras |
| i18n base | `<html lang="pt-BR">` em `layout.tsx` |

---

## Problemas

### P01 · Modal sem gestão de foco e Escape
**Categoria:** a11y · WCAG 2.1.2 / 2.4.3  
**Severidade:** Alta  

**Evidência:** `apps/web/src/components/ui.tsx` — `Modal` declara `role="dialog"` + `aria-modal="true"`, mas não captura Tab, não fecha com Escape, não move foco para o painel nem restaura ao fechar. Backdrop usa `tabIndex={-1}`. Usado em `dashboard/team/page.tsx` (criar/editar profissional).

**Impacto:** Usuário de teclado/leitor de tela pode “escapar” para o conteúdo atrás do dialog; Escape esperado não funciona.

**Recomendação:** Trap de foco, `keydown` Escape → `onClose`, `autoFocus` no título/primeiro controle, restore do elemento que abriu.

---

### P02 · `listbox` de horários sem padrão de teclado
**Categoria:** a11y · WCAG 4.1.2 / 2.1.1  
**Severidade:** Alta  

**Evidência:** `u/[slug]/page.tsx` (~L592–614) e `agendamento/[token]/page.tsx` — `ul role="listbox"` com `button role="option"` + `aria-selected`, sem `aria-activedescendant`, sem setas ↑↓←→ / Home / End, sem roving tabindex. Opções são botões focáveis em sequência (padrão híbrido inválido para listbox).

**Impacto:** Anúncio inconsistente em AT; navegação por teclado mais lenta e fora da expectativa de listbox.

**Recomendação:** Ou implementar listbox completo (roving tabindex + teclado), ou trocar para `radiogroup`/`role="radio"` (já usado em estrelas) / grid de botões sem roles compostos.

---

### P03 · Inconsistência do design system Graphite
**Categoria:** Consistência DS / hierarquia visual  
**Severidade:** Média  

**Evidência:**
- Superfícies “novas”: `surface-elevated`, `PageTitle`, `rounded-2xl` (dashboard overview, agenda, clients, booking).
- Superfícies “legadas”: `rounded-lg bg-white/80 … ring-1 ring-stone-200`, `text-stone-900/600/500` em `services`, `availability`, `waitlist`, `reviews`, `billing`, `settings`, `reports`, legal (`termos`/`privacidade`).
- Hex soltos `#6b736e` / `#d5dbd6` em booking em vez de `text-muted` / `border-line`.

**Impacto:** Dashboard parece dois produtos; onboarding visual do Graphite não se sustenta nas telas operacionais.

**Recomendação:** Migrar páginas legadas para tokens (`surface`, `text-ink`, `text-muted`, `border-line`) e componentes `EmptyState`/`StatCard` já existentes.

---

### P04 · Contraste de texto abaixo do ideal WCAG AA
**Categoria:** a11y · WCAG 1.4.3  
**Severidade:** Média  

**Evidência:**
- `--color-muted-soft: #9aa39c` em paper (~#f4f6f3) — típico < 4.5:1; usado em `placeholder:text-muted-soft` (`ui.tsx` controlClass) e botões disabled.
- Auth/marketing: `text-white/30` (copyright `AuthShell`), `text-white/40–45` (labels hero `page.tsx`, footer), `text-white/50–55` (listas/benefícios).
- Labels uppercase `text-[11px]` + `text-muted` / `text-white/55` em `StatCard` e cards — tamanho pequeno agrava legibilidade.
- Reviews: `text-stone-400` em metadados (`dashboard/reviews/page.tsx`).

**Impacto:** Placeholders, meta-copy e hero secundário falham AA em muitos monitores; usuários com baixa visão perdem contexto.

**Recomendação:** Elevar muted-soft (≥ ~#6b736e em paper); em planos escuros usar ≥ `white/70` para texto informativo; reservar opacidades baixas só para decoração (`aria-hidden`).

---

### P05 · Alvos de toque e densidade no mobile
**Categoria:** Usabilidade mobile · WCAG 2.5.5 (AAA) / boas práticas 44px  
**Severidade:** Média  

**Evidência:**
- `Button` `size="sm"`: `min-h-9` (36px) — usado no dashboard overview (copiar link / ver página).
- Step pills booking: label `hidden sm:inline` — no mobile só número ~16px em chip compacto (`px-2.5 py-1`); não são controles (ok), mas feedback de progresso é frágil.
- Grid de slots `grid-cols-3` com `py-2.5` — área ok em altura, mas estreita em largura em telas ~320px.
- `DashboardShell`: 11 itens de nav + Sair; drawer `max-h-[min(70vh,28rem)]` com scroll; overlay fecha, mas sem focus trap no menu aberto.
- Remoção de tags CRM: botão `text-[11px]` / `px-2 py-0.5` (`clients/page.tsx`).

**Impacto:** Erros de toque; menu longo cansa; progresso do booking menos legível no polegar.

**Recomendação:** `sm` ≥ `min-h-11` ou `touch-target` em CTAs críticos; agrupar nav (Agenda / Clientes / Config); trap + foco no primeiro link ao abrir Menu.

---

### P06 · Loading states inconsistentes
**Categoria:** Empty / loading / feedback  
**Severidade:** Baixa–Média  

**Evidência:** Overview usa `PageSkeleton`; agenda/clients usam `Spinner` inline; services/team/settings/billing/reviews/waitlist/availability usam só `<Spinner />` (sem skeleton estrutural). Erro no overview substitui a página inteira por `<Alert>` sem ação de retry.

**Impacto:** CLS perceptível e sensação de “app incompleto” nas telas legadas; falha de carga sem caminho claro de recuperação.

**Recomendação:** Padronizar `PageSkeleton` (ou skeleton por seção) + `Alert` com botão “Tentar de novo”.

---

### P07 · Stepper do booking não é navegável
**Categoria:** Usabilidade / fluxos booking  
**Severidade:** Baixa–Média  

**Evidência:** `StepPills` (`u/[slug]/page.tsx`) renderiza `<span>` com `aria-current="step"` — correto semanticamente como indicador, mas etapas concluídas não são clicáveis para voltar; só botões “Voltar” no rodapé de cada step.

**Impacto:** Em fluxos longos (serviço → profissional → dia → horário → dados), voltar várias etapas exige múltiplos toques.

**Recomendação:** Tornar steps `complete` botões que chamam `setStep`, mantendo `aria-current` no atual.

---

### P08 · CRM: microcopy e filtros pouco orientados ao negócio
**Categoria:** Usabilidade CRM  
**Severidade:** Baixa  

**Evidência:** Hint do filtro segmento: *“API filtra após métricas da página atual.”* (`clients/page.tsx` ~L557) — jargão de implementação. Empty state com filtros ativos explica bem; detalhe do cliente é rico (segmento, tags, consent, notas) com bons empty states internos.

**Impacto:** Dono do negócio pode não confiar no filtro ou achar bug quando a página atual não reflete o segmento esperado.

**Recomendação:** Substituir hint por linguagem de produto (“Mostra quem encaixa neste segmento nesta página”) ou filtrar server-side de forma transparente.

---

### P09 · Inputs anulam outline global (mitigado por ring)
**Categoria:** a11y / consistência foco  
**Severidade:** Baixa  

**Evidência:** `controlClass` em `ui.tsx`: `focus:outline-none focus:ring-4 focus:ring-mint-deep/10` — o ring é sutil (10% opacity). Em alguns fundos pode ficar abaixo do contraste do `:focus-visible` global de 2px mint-deep.

**Impacto:** Foco em campos menos óbvio que em links/botões.

**Recomendação:** Alinhar ao token global (`ring-mint-deep/40` ou outline 2px) e preferir `focus-visible:` em vez de `focus:`.

---

### P10 · Sem dark mode de produto (só “stage” marketing)
**Categoria:** Dark mode / preferências  
**Severidade:** Informativa  

**Evidência:** Não há `prefers-color-scheme` / `.dark` / `color-scheme`. Existem planos visuais escuros (`bg-ink-stage`, `AuthShell` aside, landing) hardcoded; app/dashboard é paper-only (`bg-atmosphere`).

**Impacto:** Sem suporte a preferência do SO; usuários em ambiente escuro ficam com paper brilhante no painel.

**Recomendação:** Se priorizar: tokens semânticos (`--bg`, `--fg`) + tema claro/escuro; senão documentar “light-only” como decisão consciente.

---

### P11 · Auth: bom fluxo, pequenos gaps de a11y de formulário
**Categoria:** Auth / a11y  
**Severidade:** Baixa  

**Evidência:** Login/register usam `AuthShell`, `Field`, `Alert`, `autoComplete`, `noValidate`. Erros são page-level `Alert` (bom), mas campos não recebem `error=` no `Field` (sem `aria-invalid` por campo). Sem `aria-live` dedicado além do `role="alert"` do Alert (ok na maioria dos casos).

**Impacto:** Leitores anunciam o alerta; associação campo↔erro fica genérica em falhas de validação futuras.

**Recomendação:** Mapear erros de API para `Field error=` quando houver campo alvo.

---

### P12 · StarPicker sem navegação por setas no radiogroup
**Categoria:** a11y  
**Severidade:** Baixa  

**Evidência:** `agendamento/[token]/page.tsx` — `role="radiogroup"` com botões `role="radio"` focáveis individualmente; padrão radiogroup espera uma tab stop + setas.

**Impacto:** Mesmo padrão híbrido do listbox de slots.

**Recomendação:** Roving tabindex + ArrowLeft/Right, ou `<input type="radio">` estilizado.

---

## Matriz por fluxo

| Fluxo | Usabilidade | Hierarquia | Empty/Load/Error | a11y | Mobile | DS |
|-------|-------------|------------|------------------|------|--------|-----|
| Marketing / landing | Forte | Forte (brand hero) | N/A | Contraste muted | Ok | Graphite |
| Auth | Forte | Forte | Alert + loading btn | Bom (Field) | Ok (stack) | Graphite |
| Booking público | Forte | Clara por step | Empty + waitlist + Spinner | Gaps listbox/stepper | Step labels hidden | Graphite |
| Manage token | Boa | Clara | Spinner / Alert | StarPicker + listbox | Ok | Graphite |
| Dashboard overview | Forte | StatCards claros | PageSkeleton / Empty | Bom | CTAs sm | Graphite |
| Agenda | Boa | Lista + filtros | Spinner / Empty | Labels status ok | Stack sm: | Graphite |
| CRM clients | Boa | Lista→detalhe | Empty contextual | sr-only notes, aria tags | Cards full-width | Graphite |
| Services / avail / team / settings | Ok | Variável | Spinner bare | Modal (team) | Forms stack | **Legado stone** |
| Billing / reviews / waitlist | Ok | Fraca vs overview | Empty ok | Contraste meta | Ok | **Legado stone** |

---

## Checklist WCAG (resumo)

| Critério | Status |
|----------|--------|
| 1.4.3 Contraste | Parcial — muted-soft, white/30–45, stone-400 |
| 2.1.1 Teclado | Parcial — modal, listbox, radiogroup estrelas |
| 2.4.3 Ordem de foco | Parcial — dialog / drawer |
| 2.4.7 Foco visível | Quase — global bom; inputs ring fraco |
| 3.3.1 / 3.3.2 Labels e erros | Bom — `Field` + `Alert` |
| 4.1.2 Name, Role, Value | Parcial — roles compostos incompletos |
| 2.3.3 / motion | Bom — `prefers-reduced-motion` |
| Skip link | Ausente (nav dashboard longa) |

---

## Priorização sugerida

1. Focus trap + Escape no `Modal` (e idealmente no menu mobile).  
2. Corrigir padrão de seleção de horários (radiogroup ou listbox completo).  
3. Unificar páginas `stone-*` no Graphite.  
4. Ajustar tokens de contraste (muted-soft + dark-stage text).  
5. Elevar touch targets `sm` e CTAs de tag/chip.

---

## Nota final

**7.2 / 10** — produto com identidade visual clara e primitives a11y acima da média para um SaaS early-stage; os gaps são localizados e corrigíveis sem redesign estrutural. Subir para ~8.5 exige fechar modal/teclado nos seletores e consolidar o DS nas telas operacionais.
