# PERFORMANCE_REVIEW — Agenda Pro

**Data:** 2026-08-09  
**Escopo:** API (Nest/Prisma) + web (Next) — N+1, paginação, cache Redis, selects/payloads, workers in-process, connection pool, bundle/render  
**Método:** revisão estática de código (sem carga/load test)  
**Nota:** **6.5 / 10**

---

## Resumo executivo

Há trabalho consciente de performance (paginação de appointments/clients, agregações CRM sem N+1, índices hot-path, `connection_limit`, cache Redis do perfil público). Os maiores riscos de escala são **workers/reconcile no mesmo processo da API**, **ranking de segmento CRM em memória (full-scan do tenant)** e **slots públicos sem cache com selects gordos**. Frontend é aceitável para MVP, mas dashboard e booking público trazem payloads/render desnecessários.

---

## Nota (0–10)

| Critério | Nota | Comentário |
|----------|------|------------|
| Queries / N+1 | 7.5 | Listagens principais usam `select`/`groupBy`; CRM sem N+1 por cliente |
| Paginação | 7 | Appointments/clients OK; reviews/waitlist só `take` fixo |
| Cache Redis | 6 | Perfil público OK (TTL 60s); slots/hot paths sem cache; fail → disable permanente |
| Workers / background | 4.5 | BullMQ Worker + `setInterval` PIX **in-process** |
| Pool / infra DB | 7.5 | `connection_limit` documentado e no Compose; índices bons |
| Frontend | 6 | Client components pesados; re-fetch `/me`; sem code-split explícito |
| **Geral** | **6.5** | Bom para salão/MVP; frágil sob multi-réplica + tenants grandes |

---

## Top 5 (prioridade)

1. **Worker BullMQ + reconcile PIX no processo HTTP** — escala horizontal multiplica workers e compete com request latency.  
2. **CRM `segment` / `inactiveDays` carrega todos os clientes (+ groupBy completo) em memória** — O(n) por request.  
3. **Slots públicos sem cache + `findFirst` gordo (tenant/service/user inteiros)** — hot path de booking.  
4. **Payloads gordos (`include: true`, QR base64, list appointments pageSize=100)** — banda e serialização.  
5. **Frontend: re-fetch e falta de paginação UI / code-split** — round-trips e JS no booking público.

---

## Problemas

### P1 — Worker BullMQ in-process na API HTTP

**Severidade:** Alta  
**Área:** workers / scalability  
**Evidência:**

```41:46:apps/api/src/notifications/notifications.service.ts
  private bootstrapQueue() {
    try {
      this.queue = new Queue(QUEUE_NAME, { connection: this.connection });
      this.worker = new Worker(QUEUE_NAME, async (job) => this.processJob(job), {
        connection: this.connection,
      });
```

`NotificationsService` sobe `Queue` **e** `Worker` no mesmo processo Nest. Cada réplica da API consome jobs e disputa CPU/IO com handlers HTTP; SMTP/`createTransport` por e-mail também roda no request path do worker.

**Impacto:** sob pico de lembretes/cancelamentos, latência de booking e dashboard sobe; scaling out piora (N workers).  
**Recomendação:** processo/worker dedicado (`notifications-worker`); API só enfileira; concurrency/limiter explícitos; transporter reutilizável.

---

### P2 — Reconciliação PIX com `setInterval` + loop sequencial

**Severidade:** Alta  
**Área:** workers in-process / loops  
**Evidência:**

```27:36:apps/api/src/payments/pix-lifecycle.service.ts
  onModuleInit() {
    void this.reconcileExpired().catch((err) =>
      this.logger.warn(`Reconciliação PIX inicial falhou: ${(err as Error).message}`),
    );
    this.timer = setInterval(() => {
      void this.reconcileExpired().catch((err) =>
        this.logger.warn(`Reconciliação PIX falhou: ${(err as Error).message}`),
      );
    }, RECONCILE_INTERVAL_MS);
```

```215:223:apps/api/src/payments/pix-lifecycle.service.ts
    let released = 0;
    for (const appointmentId of ids) {
      const ok = await this.releasePendingPayment(
        appointmentId,
        'PIX expirado ou cancelado — horário liberado',
        PixChargeStatus.EXPIRED,
      );
```

Cada instância roda reconcile a cada 60s; até 200 IDs processados **em série**, cada um com `findUnique` + transaction + possível waitlist/notify.

**Impacto:** thundering herd multi-réplica; picos de write no Postgres; atraso até 60s+ sob fila.  
**Recomendação:** job único (BullMQ/cron leader election), batch/`updateMany` onde possível, paralelismo limitado com claim atômico.

---

### P3 — CRM segment/inactive: full-scan em memória

**Severidade:** Alta (escala de tenant)  
**Área:** N+1 evitado, mas O(n) / falta de paginação DB  
**Evidência:**

```61:67:apps/api/src/clients/clients.service.ts
    if (opts?.segment) {
      const ranked = await this.rankClientsBySegment(tenantId, where, now);
      const matched = ranked.filter((r) => r.segment === opts.segment);
      const total = matched.length;
      const slice = matched.slice((page - 1) * pageSize, page * pageSize);
```

```336:353:apps/api/src/clients/clients.service.ts
    const clients = await this.prisma.client.findMany({
      where,
      select: { id: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    // ...
    const completedStats = await this.prisma.appointment.groupBy({
      by: ['clientId'],
      where: {
        tenantId,
        clientId: { in: clients.map((c) => c.id) },
        status: AppointmentStatus.COMPLETED,
      },
```

`resolveInactiveClientIds` faz `groupBy` de **todos** os COMPLETED do tenant + `findMany` de nunca-completados. Comentário no código admite limite “centenas–poucos milhares”.

**Impacto:** filtro de segmento/inatividade degrada linearmente; risco de timeout/OOM em tenants grandes.  
**Recomendação:** materializar `lastCompletedAt` / `segment` (coluna ou tabela), índice + filtro SQL, ou job noturno; paginar no DB após pré-filtro.

---

### P4 — Hot path de slots públicos sem cache e com selects gordos

**Severidade:** Alta  
**Área:** cache / selects gordos / CPU  
**Evidência:**

```295:307:apps/api/src/appointments/appointments.service.ts
  async getPublicSlots(slug: string, serviceId: string, dateKey: string, professionalId?: string) {
    const tenant = await this.prisma.tenant.findFirst({
      where: { slug, deletedAt: null },
    });
    // ...
    const service = await this.prisma.service.findFirst({
      where: { id: serviceId, tenantId: tenant.id, isActive: true, deletedAt: null },
    });
```

`resolveProfessional` também carrega `User` completo. `computeSlotsFor` faz 3 queries paralelas + motor em CPU; **não** há chave Redis (só `cache:public:profile:` com TTL 60s).

Frontend: cada mudança de data/profissional dispara novo GET (`apps/web/src/app/u/[slug]/page.tsx` ~204–232).

**Impacto:** página pública sob campanha gera QPS alto em Postgres + CPU; payload de tenant inclui campos irrelevantes (loyalty, buffer, etc.).  
**Recomendação:** `select` mínimo; cache Redis curto por `(slug, serviceId, professionalId, dateKey)` com invalidação em booking/cancel; opcional pré-computar grade.

---

### P5 — Payloads / includes gordos em paths quentes

**Severidade:** Média–Alta  
**Área:** selects / payloads  
**Evidência:**

| Path | Problema |
|------|----------|
| `updateStatus` | `include: { tenant: true }` — linha inteira do tenant |
| `bookPublic` | `tenant.findFirst({ include: { subscription: true } })` sem select; create com `include: { client: true, service: true }` |
| `enqueueBookingConfirmation` / cancel | `include: { client: true, service: true, tenant: true, professional: true }` |
| `findByManageToken` | `pixCharge.qrCodeBase64` no JSON de gestão |
| `AppointmentsService.list` | default `pageSize=100` + 4 relações aninhadas |
| `ClientsService.list` | lista devolve `notes`, `tags`, `birthday`, etc. (não só card CRM) |

```54:69:apps/api/src/appointments/appointments.service.ts
const APPOINTMENT_LIST_SELECT = {
  // ... client, service, professional, pixCharge
} satisfies Prisma.AppointmentSelect;
```

```1:3:apps/api/src/common/pagination.ts
export const DEFAULT_PAGE_SIZE = 20;
export const DEFAULT_APPOINTMENTS_PAGE_SIZE = 100;
export const MAX_PAGE_SIZE = 100;
```

**Impacto:** serialização/banda; QR base64 infla respostas de manage/booking; 100 appointments × joins pressiona dashboard.  
**Recomendação:** `select` estrito; QR sob endpoint dedicado; default appointments `pageSize` 20–50; lista de clients sem `notes` longos.

---

### P6 — Cache Redis: cobertura estreita e degrade “permanente”

**Severidade:** Média  
**Área:** cache Redis  
**Evidência:** `RedisCacheService` — só perfil público; em falha seta `this.disabled = true` e não reconecta (`apps/api/src/common/cache/redis-cache.service.ts` ~58–62, 86–88). TTL 60s adequado para perfil, insuficiente como estratégia geral.

**Impacto:** blip Redis → resto do uptime da instância sem cache; slots/reports/auth não se beneficiam.  
**Recomendação:** circuit breaker com half-open; cache de slots; considerar cache de `/auth/me`/settings no edge ou short-TTL.

---

### P7 — Paginação incompleta em listagens secundárias

**Severidade:** Média  
**Área:** paginação  
**Evidência:**

- `WaitlistService.list` — `take: 200`, array cru, sem `page`/`total` (`waitlist.service.ts` ~54–62)  
- `ReviewsController.list` — `take: 100`, sem cursor/page (`reviews.controller.ts` ~31–34)  
- Dashboard appointments **não envia** `page`/`pageSize` e ignora `total` (`appointments/page.tsx` ~88–93) — risco de truncar calendários densos (>100 no range)

**Impacto:** dados cortados sem UX; waitlist grande sem scroll infinito.  
**Recomendação:** `PageResult` consistente; UI com “carregar mais” / páginas.

---

### P8 — Connection pool: documentado, sem enforcement no código

**Severidade:** Baixa–Média  
**Área:** connection pool  
**Evidência:** `.env.example` e `docker-compose.prod.yml` usam `connection_limit=10`; `DATABASE.md` explica a regra. `PrismaService` é wrapper padrão sem middleware de query timing / pool metrics.

**Impacto:** config correta mitiga; má configuração em deploy custom ainda estoura `max_connections` (N réplicas × pool).  
**Recomendação:** validar `connection_limit` no boot; métricas Prisma/pg; PgBouncer se > poucas réplicas.

---

### P9 — Frontend: render client-heavy e round-trips extras

**Severidade:** Média  
**Área:** frontend bundle/render  
**Evidência:**

- Booking público `'use client'` na página inteira (`u/[slug]/page.tsx`) — sem RSC para shell/perfil  
- `AppointmentsPage.load` sempre chama `/api/auth/me` junto com appointments (~88–91)  
- Sem `next/dynamic` / split de `PixBlock`  
- `next.config.ts` só `standalone` — sem bundle analyzer / otimizações extras  
- QR via `data:image/png;base64,...` no DOM (`components/pix.tsx`)

**Impacto:** TTI pior no funil público; dashboard faz work extra a cada filtro/status.  
**Recomendação:** perfil público via RSC/SSR + cache; timezone do layout/context; lazy do bloco PIX; paginação real na UI.

---

### P10 — Notificações: transporter SMTP recriado por job

**Severidade:** Baixa  
**Área:** loops / IO  
**Evidência:** `sendEmail` → `nodemailer.createTransport` a cada job (`notifications.service.ts` ~375–379).

**Impacto:** overhead em rajadas de e-mail.  
**Recomendação:** transporter singleton lazy no serviço.

---

## O que está bem (crédito)

| Item | Evidência |
|------|-----------|
| Lista de appointments paginada + `select` | `AppointmentsService.list` + `APPOINTMENT_LIST_SELECT` |
| CRM page-scoped sem N+1 | `loadClientMetrics` com 4× `groupBy` em `Promise.all` |
| Reports agregados | `ReportsService.summary` — `groupBy`/`aggregate` paralelos |
| Cache perfil público + invalidação | `getPublicProfile` / settings/services/team/reviews |
| Índices hot-path | `schema.prisma` + `DATABASE.md` |
| Booking com lock + overlap em TX | `pg_advisory_xact_lock` + recheck busy |
| Pool documentado | `.env.example`, Compose prod |

---

## Checklist de follow-up (sem implementar aqui)

- [x] Extrair BullMQ Worker (+ PIX reconcile) para processo separado (`worker.ts` + compose)
- [ ] Materializar métricas/segmento de cliente ou filtrar no SQL  
- [x] Cache Redis de slots públicos (TTL 20s + invalidate); `select` mínimo em `getPublicSlots`/`bookPublic` ainda residual  
- [ ] Enxugar includes de notifications/manageToken; QR sob demanda  
- [ ] Paginação real em waitlist/reviews + UI appointments  
- [ ] Reconnect/circuit breaker no `RedisCacheService`  
- [ ] RSC/lazy no booking público; parar de rebuscar `/me` a cada load  

---

## Veredito

**Atualização 2026-08-09:** worker separado + cache de slots → ver [`SCORECARD_PERFORMANCE_SCALE.md`](./SCORECARD_PERFORMANCE_SCALE.md) (**8.0/10**).

**6.5/10** (review estático pré-worker) — base sólida para volume de salão. Limitadores originais: background in-process e slots sem cache (mitigados no scorecard atual).
