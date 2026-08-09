# MEGA CODE REVIEW — Agenda Pro

**Data:** 2026-08-09  
**Método:** consolidação das 10 revisões individuais (evidência cruzada; sem achismo; sem alteração de código de produto).  
**Workspace:** `C:\Users\João Neto\Projects\agenda-pro`

---

## 1. Resumo Executivo

SaaS MVP endurecido com núcleo sólido (multi-tenant, anti double-booking, auth cookie-first, PIX lifecycle interno, funil público). A nota cai por **bypass de pagamento PIX explorável**, gaps de segurança/ops e dívida concentrada no God Service + frontend CSR monolítico. **Não shipar cobrança PIX em produção** até fechar o bypass.

### Notas por dimensão (0–10)

| Dimensão | Nota | Fonte principal |
|----------|------|-----------------|
| Arquitetura | **6.5** | [ARCHITECTURE_REVIEW.md](./ARCHITECTURE_REVIEW.md) |
| Segurança | **5.5** | [SECURITY_REVIEW.md](./SECURITY_REVIEW.md) |
| Performance | **6.5** | [PERFORMANCE_REVIEW.md](./PERFORMANCE_REVIEW.md) |
| Banco | **6.5** | [DATABASE_REVIEW.md](./DATABASE_REVIEW.md) |
| Frontend | **6.0** | [FRONTEND_REVIEW.md](./FRONTEND_REVIEW.md) |
| UX | **7.2** | [UX_REVIEW.md](./UX_REVIEW.md) |
| DevOps | **6.5** | [DEVOPS_REVIEW.md](./DEVOPS_REVIEW.md) |
| Testes | **5.5** | [QA_REVIEW.md](./QA_REVIEW.md) |
| Escalabilidade | **5.5** | Arch (processos 5.5) + Perf (workers 4.5) |
| Prontidão Produção | **5.8** | Prod 6.8 × Sec 5.5 × DevOps 6.5 × QA 5.5 |

### Média ponderada

Pesos orientados a risco de produção (Segurança 18%; demais 7–10%):

| Dimensão | Nota | Peso | Contribuição |
|----------|------|------|--------------|
| Arquitetura | 6.5 | 10% | 0.65 |
| Segurança | 5.5 | 18% | 0.99 |
| Performance | 6.5 | 10% | 0.65 |
| Banco | 6.5 | 10% | 0.65 |
| Frontend | 6.0 | 8% | 0.48 |
| UX | 7.2 | 7% | 0.50 |
| DevOps | 6.5 | 10% | 0.65 |
| Testes | 5.5 | 10% | 0.55 |
| Escalabilidade | 5.5 | 9% | 0.50 |
| Prontidão Produção | 5.8 | 8% | 0.46 |
| **Média ponderada** | | **100%** | **≈ 6.1 / 10** |

Média aritmética simples das 10 reviews-fonte (Arch/Backend/DB/Perf/Sec/FE/UX/DevOps/QA/Product): **≈ 6.4 / 10**.

**Veredito:** pronto para early adopters solo com onboarding assistido; **não** pronto para GTM com PIX deposit, billing self-serve agressivo ou multi-réplica sem worker separado.

---

## 2. Top 20 Problemas Mais Graves

*Itens deduplicados entre agentes. Mesmo bug em N reviews = 1 linha.*

| # | Gravidade | Problema | Fontes | Evidência / impacto |
|---|-----------|----------|--------|---------------------|
| 1 | **Crítico** | Cliente confirma presença e **fura o sinal PIX** (`confirmByToken` / FSM `PENDING_PAYMENT → CONFIRMED` sem `PixCharge.PAID`) | Backend #1, Security SEC-01 | `appointments.service.ts` ~719–729; `appointment-state.ts`; reconcile só cancela se ainda `PENDING_PAYMENT` → slot confirmado sem pagar |
| 2 | **Alto** | Downgrade para **STARTER não cancela assinatura Stripe** (continua cobrando) | Backend #2 | `billing.service.ts` `createCheckout` ramo STARTER; não chama `subscriptions.cancel` nem limpa `stripeSubscriptionId` |
| 3 | **Alto** | `manageToken` = `cuid()` **em claro** no DB (capability URL fraca) | Security SEC-02 | `schema.prisma` `@default(cuid())`; contraste com refresh `randomBytes(48)` + hash |
| 4 | **Alto** | `DELETE/export account` **sem step-up** (senha/reauth) | Security SEC-03 | `account.controller.ts` só `@Roles(OWNER)` → sessão roubada = wipe LGPD |
| 5 | **Alto** | `UNIQUE (professionalId, startsAt)` **inclui cancelados** — bloqueia rebook pós-cancel/PIX expirado | Database #1 | Schema absoluto vs `ACTIVE_APPOINTMENT_STATUSES`; P2002 falso “já reservado” |
| 6 | **Alto** | **BullMQ Worker + reconcile PIX in-process** na API HTTP | Architecture #3, Performance P1/P2, DevOps D-09 | `notifications.service.ts` Worker no bootstrap; `pix-lifecycle` `setInterval` 60s; compose sem `worker` |
| 7 | **Alto** | Throttling **só in-memory** + `POST /auth/register` sem `@Throttle` dedicado | Security SEC-04 | `ThrottlerModule` sem Redis; N réplicas = N× limite; spam de tenants |
| 8 | **Alto** | Backup/DR documentados, **RPO 24h não garantido** (sem cron/off-host/drill) | DevOps D-01 | Scripts manuais `./backups/`; sem restore bash; sem pipeline |
| 9 | **Alto** | Overlap parcial **só na app**; sem `EXCLUDE`/GiST no Postgres | Database #2 | Comentário schema; writes fora do path com lock podem sobrepor |
| 10 | **Alto** | Integridade multi-tenant **só na aplicação** (sem FK composta / FKs órfãs) | Database #3 | Waitlist/Loyalty/NotificationJob sem FK; DB aceitaria cross-tenant |
| 11 | **Alto** | CRM `segment`/`inactive`: **full-scan em memória** O(n) do tenant | Performance P3 | `clients.service.ts` `rankClientsBySegment` + `groupBy` completo |
| 12 | **Alto** | `AppointmentsService` **God Object** (~809 linhas) + superfície pública | Architecture #1 | book/slots/profile/manage/PIX/side-effects no mesmo service |
| 13 | **Alto** | Sem **CD**; observabilidade só logs+health (sem métricas/Sentry/alertas) | DevOps D-02, D-03 | CI para em build; `DEPLOYMENT.md` plano não instalado |
| 14 | **Alto** | Compose prod: Redis **sem AUTH**; API/Web HTTP sem TLS/proxy | DevOps D-04 | `redis-server --appendonly yes`; defaults fracos de senha PG |
| 15 | **Alto** | BAC **intra-tenant**: MEMBER lê CRM completo e pode promover status pós-PIX | Security SEC-05 | Clients/Appointments só `JwtAuthGuard`; docs admitem RBAC fino pendente |
| 16 | **Alto** | Agenda FE **ignora paginação** da API (`pageSize` default 100, sem `total`) | Frontend #1, Performance P7 | Dashboard/appointments truncam silenciosamente; métricas subcontadas |
| 17 | **Alto** | **Web sem testes** (0 specs; Playwright ausente) | QA #1, Frontend #9 | `package.json` echo “No web tests”; booking/manage/auth sem rede |
| 18 | **Alto** | Hot path **slots públicos sem cache** + selects gordos | Performance P4 | `getPublicSlots` sem Redis; FE refetch a cada data/profissional |
| 19 | **Alto** | Onboarding **sem caminho até o 1º agendamento** (sem serviço seed/wizard) | Product P-01 | Register → dashboard; `/u/[slug]` morto sem serviços |
| 20 | **Alto** | Monorepo sem `packages/*` — **drift de contratos** FE/API | Architecture #2, Frontend #6 | `PixChargeStatus` sem `REFUNDED`; comments de JWT no body obsoletos |

### Menções graves logo abaixo do Top 20 (não perdidas)

| Problema | Fontes |
|----------|--------|
| `maxAdvanceDays` só na listagem de slots, não no `bookPublic` | Backend #3 |
| Remarcação reenfileira lembretes sem invalidar os antigos | Backend #4 |
| Booking público ignora `SubscriptionStatus` (ex.: PAST_DUE) | Backend #5 |
| AuthGuard bloqueia por `localStorage` antes do cookie httpOnly | Frontend #4 |
| Modal sem focus trap / Escape (WCAG) | UX P01 |
| Webhooks MP/Stripe sem testes de assinatura | QA #2 |
| Billing self-serve incompleto (sem Customer Portal / past_due UX) | Product P-05 |

---

## 3. Top 20 Melhorias de Maior ROI

*Ordenadas por impacto ÷ esforço (evidência das reviews).*

| # | Melhoria | Esforço | ROI | Fontes |
|---|----------|---------|-----|--------|
| 1 | Bloquear `confirmByToken` (e staff) em `PENDING_PAYMENT` sem charge `PAID`; FSM só via webhook/`confirmPaid` | P | Crítico | Backend, Security |
| 2 | No checkout STARTER: cancelar Stripe + limpar IDs antes de persistir free | P | Alto $ | Backend |
| 3 | Unique parcial appointments `(professionalId, startsAt) WHERE status IN (ativos)` | M | Alto ops | Database |
| 4 | Extrair processo `worker` (BullMQ + reconcile PIX); compose service separado | M | Alto escala | Arch, Perf, DevOps |
| 5 | AuthGuard: sempre probe `/api/auth/me`; localStorage só hint | P | Alto UX | Frontend |
| 6 | Tipar `AppointmentListResponse` + paginação UI + corrigir StatCard “7 dias” | P–M | Alto correção | Frontend, Perf |
| 7 | Wizard pós-signup (serviço template → testar link → compartilhar) | M | Alto ativação | Product |
| 8 | `manageToken`: `randomBytes` + hash at rest | M | Alto sec | Security |
| 9 | Step-up password em DELETE/export account | P | Alto sec | Security |
| 10 | Redis AUTH + remover defaults fracos no compose prod + TLS na frente | P–M | Alto ops | DevOps |
| 11 | Uptime em `/api/health/ready` + alerta 5xx | P | Alto ops | DevOps |
| 12 | Backup cron → upload cifrado off-host + 1 restore drill | M | Alto DR | DevOps |
| 13 | `assertWithinBookingWindow` em `bookPublic` + `rescheduleByToken` | P | Médio–Alto | Backend |
| 14 | Focus trap + Escape no `Modal` (e menu mobile) | P | Médio a11y | UX |
| 15 | Throttler Redis + `@Throttle` em register | P–M | Alto abuse | Security |
| 16 | Cache Redis curto de slots públicos + `select` mínimo | M | Alto perf | Performance |
| 17 | Playwright smoke: register → book → manage; login → agenda | M | Alto QA | QA, Frontend |
| 18 | Stripe Customer Portal + banner PAST_DUE | M | Alto $ | Product, Backend |
| 19 | Invalidar NotificationJobs PENDING no reschedule | M | Médio | Backend |
| 20 | `packages/shared` ou OpenAPI → enums/DTOs alinhados (ex.: `REFUNDED`) | M | Médio dívida | Architecture |

---

## 4. Riscos Críticos

| Risco | Tipo | Evidência consolidada |
|-------|------|------------------------|
| **Cliente confirma horário sem pagar PIX** | Prejuízo / fraude de negócio | Backend #1 + Security SEC-01; charge pode expirar mantendo `CONFIRMED` |
| **Stripe continua cobrando após “voltar ao Starter”** | Prejuízo / chargeback / confiança | Backend #2 |
| **Dump de DB = takeover em massa dos manage links** | Vazamento / takeover | Security SEC-02 (`cuid` plaintext + QR/copyPaste no token) |
| **Sessão OWNER roubada → wipe LGPD + cancel Stripe** | Perda de dados / destruição | Security SEC-03 |
| **Multi-réplica multiplica workers/reconcile PIX** | Derrubar prod / corridas / carga | Arch #3, Perf P1/P2, DevOps D-09 |
| **Perda de volume sem backup off-host recente** | Perda de dados | DevOps D-01 (RPO real = “último dump manual”) |
| **Redis/API plaintext em host mal isolado** | Vazamento / sessão | DevOps D-04 |
| **Unique absoluto impede rebook após cancel** | Prejuízo operacional (slots fantasma ocupados no unique) | Database #1 |
| **Overlap sem EXCLUDE** se write bypassar app | Corrupção de agenda | Database #2 |
| **CRM segment O(n) em tenant grande** | Timeout / OOM sob escala | Performance P3 |
| **Spam de register / abuse sem throttle Redis** | Escala / custo / abuso | Security SEC-04 |
| **Agenda UI truncada (>100)** sem aviso | Perda operacional / decisões erradas | Frontend #1 |
| **Inadimplente (PAST_DUE) mantém features + booking** | Prejuízo SaaS | Backend #5 |

---

## 5. Dívida Técnica Mapeada

| Área | Dívida | Fontes |
|------|--------|--------|
| **Core agenda** | `AppointmentsService` God Object; Availability CRUD sem engine; PublicController no AppointmentsModule | Architecture #1, #5 |
| **Contratos** | `packages/*` ausente; types manuais; drift `REFUNDED` / JWT comments; união `T \| Array` no FE | Architecture #2, Frontend #6 |
| **Background** | Worker + PIX timer no processo HTTP; docs afirmam worker no compose (falso) | Architecture #3, #10; Perf; DevOps |
| **Frontend** | CSR quase total; pages 500–800 linhas; sem `features/`/`hooks/`; sem `loading`/`error.tsx`; N× `/auth/me` | Architecture #4, Frontend #2–3, #7; Perf P9 |
| **DB** | Unique absoluto vs lifecycle; sem EXCLUDE; FKs órfãs; phone/waitlist sem unique parcial; CHECKs ausentes; migrations sem `CONCURRENTLY` | Database #1–7 |
| **AuthZ** | Helpers `tenant-scope` mortos; RBAC fino pendente; MEMBER = CRM total | Architecture #6, Security SEC-05 |
| **Cache** | Invalidação espalhada; Redis disable permanente em falha; só perfil público cacheado | Architecture #8, Perf P6 |
| **Notificações** | Reschedule não cancela jobs; SMTP transporter por job; claim NotificationJob sem CAS | Backend #4, Database #9, Perf P10 |
| **Billing produto** | TRIALING sem trial UX; sem Customer Portal; placeholders de preço no FE | Product P-02/P-05, Architecture #9 |
| **Testes** | Web 0; services de orquestração descobertos; webhooks sem fixture; `passWithNoTests`; audit soft-fail | QA, DevOps D-05, Security SEC-12 |
| **UX/DS** | Graphite vs `stone-*` legado; contraste muted; listbox/modal a11y incompletos | UX P01–P05 |
| **Ops** | Sem CD; docs migrate inconsistentes; HEALTHCHECK = readiness; health Redis abre conexão nova | DevOps D-02, D-06–D-08 |
| **Módulo hygiene** | JoinWaitlistDto no appointments; Reviews lógica no controller; Loyalty fora do AppModule | Architecture #7 |

---

## 6. Roadmap

### Fase 1 — Críticos (bloquear ship de PIX / dinheiro / wipe)

1. Fechar bypass PIX (`confirmByToken` + FSM + release inconsistente) — Backend/Security  
2. Checkout STARTER cancela Stripe — Backend  
3. Step-up em DELETE/export account — Security  
4. Unique parcial de appointments (rebook pós-cancel) — Database  
5. Backup agendado off-host + 1 restore drill — DevOps  
6. Uptime `/ready` + alerta 5xx — DevOps  

### Fase 2 — Altos (segurança, escala, produto mínimo)

1. `manageToken` alto-entropia + hash — Security  
2. Throttler Redis + throttle register — Security  
3. Worker + PIX reconcile fora do HTTP — Arch/Perf/DevOps  
4. Redis AUTH + TLS/proxy; remover defaults fracos — DevOps  
5. Gate `PENDING_PAYMENT` também no `updateStatus` staff / RBAC fino — Security  
6. Paginação appointments FE + AuthGuard + StatCard 7 dias — Frontend  
7. Wizard de ativação pós-register — Product  
8. `maxAdvanceDays` no write path; invalidar reminders no reschedule — Backend  
9. Playwright smoke + testes assinatura MP/Stripe — QA  

### Fase 3 — Médios (coesão, perf, billing UX)

1. Quebrar `AppointmentsService` em Bounded Contexts — Architecture  
2. Cache slots + selects magros; circuit breaker Redis — Performance  
3. Materializar segmento CRM / filtrar no SQL — Performance  
4. FKs órfãs + unique phone/waitlist + CHECKs — Database  
5. Stripe Customer Portal + UX PAST_DUE + entitlements por `subscription.status` — Product/Backend  
6. Extrair features web (booking/CRM) + RSC perfil público — Frontend/Arch  
7. Modal/listbox a11y + contraste + unificar Graphite — UX  
8. `packages/shared` ou OpenAPI codegen — Architecture  
9. CD registry + migrate deploy no release; docker-web no CI; audit hard gate — DevOps  
10. Coverage threshold nos módulos críticos — QA  

### Fase 4 — Baixos / backlog

1. EXCLUDE GiST overlap; FKs compostas multi-tenant — Database  
2. CSRF token / CSP Next / Referrer-Policy em manage links — Security  
3. ReviewsService; DTOs no módulo dono; limpar tenant-scope morto ou adotar — Architecture  
4. Retenção assistida + resgate loyalty; trial Pro honesto — Product  
5. Resource limits compose; Sentry/OTel; transporter SMTP singleton — DevOps/Perf  
6. Dark mode (ou documentar light-only) — UX  
7. Paridade marketplace/POS (só após densidade) — Product P-08  

---

## 7. Nota Final do Projeto

| Critério | Nota | Comentário (só evidência das reviews) |
|----------|------|----------------------------------------|
| Qualidade | **6.3** | Domínio puro e locks bons; orquestração e FE frágeis |
| Segurança | **5.5** | Fundações OK; bypass PIX + tokens/step-up derrubam |
| Escalabilidade | **5.5** | Índices/paginação OK; workers in-process + CRM O(n) |
| Confiabilidade | **6.0** | Anti double-book e PIX interno fortes; gaps billing/reminders/unique |
| Manutenibilidade | **5.8** | God Service + pages monolíticas + packages vazios |
| Observabilidade | **4.0** | Pino+health; sem metrics/APM/alertas (DevOps) |
| UX | **7.2** | Graphite e funil fortes; a11y/DS legado localizados |
| Prep Produção | **5.8** | CI/Docker/docs bons; CD/backup/PIX/security gates faltam |
| **Nota geral do projeto** | **≈ 6.1 / 10** | Média ponderada §1 |

**Leitura:** fundação de portfolio/MVP **acima da média**; checklist mínimo para tenants pagantes com PIX e RPO contratado **ainda aberto**.

---

## 8. Links para os 10 reviews individuais

| # | Review | Nota | Path |
|---|--------|------|------|
| 1 | Arquitetura | 6.5 | [ARCHITECTURE_REVIEW.md](./ARCHITECTURE_REVIEW.md) |
| 2 | Backend | 6.5 | [BACKEND_REVIEW.md](./BACKEND_REVIEW.md) |
| 3 | Banco de dados | 6.5 | [DATABASE_REVIEW.md](./DATABASE_REVIEW.md) |
| 4 | Performance | 6.5 | [PERFORMANCE_REVIEW.md](./PERFORMANCE_REVIEW.md) |
| 5 | Segurança | 5.5 | [SECURITY_REVIEW.md](./SECURITY_REVIEW.md) |
| 6 | Frontend | 6.0 | [FRONTEND_REVIEW.md](./FRONTEND_REVIEW.md) |
| 7 | UX / a11y | 7.2 | [UX_REVIEW.md](./UX_REVIEW.md) |
| 8 | DevOps / SRE | 6.5 | [DEVOPS_REVIEW.md](./DEVOPS_REVIEW.md) |
| 9 | QA / Testes | 5.5 | [QA_REVIEW.md](./QA_REVIEW.md) |
| 10 | Produto | 6.8 | [PRODUCT_REVIEW.md](./PRODUCT_REVIEW.md) |

---

*Consolidação estática em 2026-08-09. Único artefato de escrita desta entrega: este arquivo (e, se aplicável, um link mínimo em `docs/DOCUMENTATION.md`). Nenhum código de produto foi alterado.*

---

## Status Correções Fase 1

**Data implementação:** 2026-08-09  
**Branch:** `cursor/saas-hardening-crm-infra`

### Fechado neste PR mental

| # | Item | Status | Notas |
|---|------|--------|-------|
| 1 | Bypass PIX (`confirmByToken` / FSM / release) | **Fechado** | FSM: `PENDING_PAYMENT` → só `CANCELLED`; `confirmByToken` e `updateStatus` bloqueiam promoção sem pagamento; `confirmPaid` segue como único path; `releasePendingPayment` cancela também `CONFIRMED`/`SCHEDULED` com charge ainda `PENDING` |
| 2 | Downgrade STARTER cancela Stripe | **Fechado** | `createCheckout(STARTER)` cancela subscription Stripe (fail-closed), limpa `stripeSubscriptionId`, só então persiste free |
| 3 | `manageToken` alto-entropia + hash | **Fechado** | `randomBytes(48)` + SHA-256 at rest; dual-read legado (cuid/md5 plaintext); migration drop default cuid; raw só na URL / enqueue de notificação |
| — | `maxAdvanceDays` no write path | **Fechado** | `assertWithinBookingWindow` em `bookPublic` e `rescheduleByToken` |
| 4 | Step-up DELETE/export account | **Fechado** | `POST /account/export` + `DELETE /account` exigem `{ password }`; UI settings pede senha |
| 5 | Unique parcial appointments | **Fechado** | Migration `20260809270000_phase1_appointments_active_unique` — só PENDING_PAYMENT/SCHEDULED/CONFIRMED |
| 6 | Backup off-host + restore drill | **Fechado** | `BACKUP_OFFHOST_DIR` / `-OffHostDir`; `scripts/restore-drill.ps1`; docs em `BACKUP.md` |
| 7 | Uptime `/ready` + alerta | **Fechado** | `scripts/watch-ready.ps1` + `HEALTH_ALERT_WEBHOOK_URL`; `npm run ops:watch-ready` |

### Breaking / compat adicionais

- **LGPD export:** `GET /account/export` → `POST /account/export` com senha.
- **Unique appointments:** cancelados/no-show/completed **não** bloqueiam rebook do mesmo `startsAt`.
