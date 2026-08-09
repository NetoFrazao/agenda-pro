# Backend Review — Agenda Pro

**Escopo:** `apps/api/src/**` (controllers, services, DTOs, validation, errors, fluxos críticos)  
**Método:** revisão estática com evidência no código; sem alterações de runtime.  
**Nota geral: 6.5 / 10**

A API tem base sólida (multi-tenant, locks de agenda, máquina de estados, PIX idempotente, refresh com detecção de reuse, LGPD). A nota cai por um buraco crítico no fluxo de sinal PIX e por inconsistências de billing/regras de booking que quebram o contrato do produto em produção.

---

## Top issues

1. **Cliente confirma presença e fura o sinal PIX** (crítica)
2. **Downgrade para STARTER não cancela assinatura Stripe** (alta)
3. **`maxAdvanceDays` só na listagem de slots, não no book** (média)
4. **Remarcação reenfileira lembretes sem invalidar os antigos** (média)
5. **Booking público ignora `SubscriptionStatus` (ex.: PAST_DUE)** (média)

---

## Problemas

### 1. Cliente confirma presença e fura o sinal PIX

| Campo | Valor |
|--------|--------|
| **Gravidade** | Crítica |
| **Categoria Backend** | Consistência de estados / Payments |
| **Localização** | `appointments/appointments.service.ts` (`confirmByToken`); `appointments/appointment-state.ts`; `payments/pix-lifecycle.service.ts` (`releasePendingPayment`); `public/public.controller.ts` `POST public/appointments/:token/confirm` |
| **Esforço** | P |

**Problema**  
`confirmByToken` permite transição `PENDING_PAYMENT → CONFIRMED` sem verificar `PixCharge` pago. A máquina de estados autoriza essa transição, e o release de PIX expirado só cancela o appointment se ainda estiver `PENDING_PAYMENT`.

**Impacto**  
Com `manageToken` (devolvido no book e no e-mail), o cliente confirma o horário sem pagar o sinal. O job de reconciliação/expiração marca a cobrança como `EXPIRED`/`CANCELLED` mas **mantém o agendamento `CONFIRMED`**, ocupando o slot.

**Evidência**

```719:729:apps/api/src/appointments/appointments.service.ts
  async confirmByToken(token: string) {
    const appointment = await this.findByManageToken(token);
    if (appointment.status === AppointmentStatus.CONFIRMED) {
      return { ok: true, status: appointment.status };
    }
    assertValidTransition(appointment.status, AppointmentStatus.CONFIRMED);
    await this.prisma.appointment.update({
      where: { id: appointment.id },
      data: { status: AppointmentStatus.CONFIRMED },
    });
    return { ok: true, status: AppointmentStatus.CONFIRMED };
  }
```

```8:13:apps/api/src/appointments/appointment-state.ts
const TRANSITIONS: Record<AppointmentStatus, readonly AppointmentStatus[]> = {
  [AppointmentStatus.PENDING_PAYMENT]: [
    AppointmentStatus.CONFIRMED,
    AppointmentStatus.SCHEDULED,
    AppointmentStatus.CANCELLED,
  ],
```

```110:154:apps/api/src/payments/pix-lifecycle.service.ts
    const wasPending = appt.status === AppointmentStatus.PENDING_PAYMENT;
    const canExpireCharge =
      Boolean(appt.pixCharge) && appt.pixCharge!.status === PixChargeStatus.PENDING;

    if (!wasPending && !canExpireCharge) return false;
    // ...
    if (wasPending) {
      await tx.appointment.updateMany({
        where: { id: appt.id, status: AppointmentStatus.PENDING_PAYMENT },
        data: {
          status: AppointmentStatus.CANCELLED,
          // ...
        },
      });
    }
    // ...
    if (wasPending) {
      await notifyNextWaitlistCandidate(/* ... */);
```

**Solução**  
- Em `confirmByToken`, rejeitar se `status === PENDING_PAYMENT` (ou exigir `pixCharge.status === PAID`).  
- Restringir `PENDING_PAYMENT → CONFIRMED` à confirmação via webhook/`PixLifecycleService.confirmPaid` (e, se necessário, path autenticado do profissional com regra explícita).  
- Em `releasePendingPayment`, se charge expira e appointment saiu de `PENDING_PAYMENT` sem `PAID`, cancelar ou reverter para estado seguro + log de auditoria.

---

### 2. Downgrade para STARTER não cancela assinatura Stripe

| Campo | Valor |
|--------|--------|
| **Gravidade** | Alta |
| **Categoria Backend** | Billing |
| **Localização** | `billing/billing.service.ts` → `createCheckout` (ramo `plan === STARTER`) |
| **Esforço** | P |

**Problema**  
Checkout STARTER atualiza `tenant.plan` e `subscription` localmente para STARTER/`ACTIVE`, mas **não** chama `stripe.subscriptions.cancel` / `cancel_at_period_end` e **não** limpa `stripeSubscriptionId`.

**Impacto**  
Tenant em PRO/BUSINESS pago faz “voltar ao Starter”: perde features no app, mas o Stripe continua cobrando. Webhooks posteriores podem divergir ainda mais o estado local vs. PSP.

**Evidência**

```99:124:apps/api/src/billing/billing.service.ts
  async createCheckout(tenantId: string, plan: PlanCode) {
    if (plan === PlanCode.STARTER) {
      await this.prisma.tenant.update({
        where: { id: tenantId },
        data: { plan: PlanCode.STARTER },
      });
      await this.prisma.subscription.upsert({
        where: { tenantId },
        create: {
          tenantId,
          plan: PlanCode.STARTER,
          status: SubscriptionStatus.ACTIVE,
          monthlyBookingLimit: PLAN_META.STARTER.monthlyBookingLimit,
        },
        update: {
          plan: PlanCode.STARTER,
          status: SubscriptionStatus.ACTIVE,
          cancelAtPeriodEnd: false,
          monthlyBookingLimit: PLAN_META.STARTER.monthlyBookingLimit,
        },
      });
      return {
        mode: 'free' as const,
        url: `${this.env.appPublicUrl}/dashboard/billing?ok=starter`,
      };
    }
```

Compare com `cancel()` / `cancelImmediatelyForAccountDeletion()`, que **sim** tocam o Stripe quando há `stripeSubscriptionId`.

**Solução**  
No ramo STARTER: se existir `stripeSubscriptionId`, cancelar no Stripe (imediato ou `cancel_at_period_end` conforme produto), limpar ou marcar IDs, e só então persistir o plano free — idealmente numa transação + tratamento de falha do PSP.

---

### 3. `maxAdvanceDays` só na listagem de slots, não no book

| Campo | Valor |
|--------|--------|
| **Gravidade** | Média |
| **Categoria Backend** | Validation / Booking |
| **Localização** | `appointments/appointments.service.ts` → `getPublicSlots` vs `bookPublic` |
| **Esforço** | P |

**Problema**  
A janela máxima de antecipação é aplicada ao retornar slots vazios, mas `bookPublic` valida `minNoticeMinutes`, slot na grade e overlap — **não** `maxAdvanceDays`. `computeDaySlots` também não conhece esse limite.

**Impacto**  
Cliente (ou script) que POST em `/api/public/:slug/book` com `startsAt` além de `maxAdvanceDays` pode reservar horário que a UI nunca ofereceria.

**Evidência**

```308:318:apps/api/src/appointments/appointments.service.ts
    const maxDate = new Date(Date.now() + tenant.maxAdvanceDays * 86_400_000);
    if (dateKey > toDateKey(maxDate, tenant.timezone)) {
      return {
        date: dateKey,
        // ...
        slots: [],
      };
    }
```

Em `bookPublic` (aprox. L413–449): há check de `minNoticeMinutes` e `validSlots`, sem comparação equivalente a `maxAdvanceDays`.

**Solução**  
Extrair helper `assertWithinBookingWindow(tenant, startsAt)` e usar em `bookPublic` e `rescheduleByToken` (além de `getPublicSlots`).

---

### 4. Remarcação reenfileira lembretes sem invalidar os antigos

| Campo | Valor |
|--------|--------|
| **Gravidade** | Média |
| **Categoria Backend** | Notifications / Booking |
| **Localização** | `appointments/appointments.service.ts` → `rescheduleByToken`; `notifications/notifications.service.ts` → `enqueueBookingConfirmation` / `processJob` |
| **Esforço** | M |

**Problema**  
Após remarcar, o fluxo chama `enqueueBookingConfirmation` de novo. Não há cancelamento de `NotificationJob` PENDING de `BOOKING_REMINDER` (nem remoção do job BullMQ) do horário anterior. O worker só aborta lembrete se status for `CANCELLED`/`NO_SHOW`, não se `startsAt` mudou.

**Impacto**  
Lembretes duplicados e/ou no horário antigo (texto e `delay` gravados no enqueue), confusão do cliente e ruído operacional.

**Evidência**

```846:854:apps/api/src/appointments/appointments.service.ts
    await notifyNextWaitlistCandidate(
      this.prisma,
      this.notifications,
      appointment.tenantId,
      appointment.startsAt,
      tenant,
    );
    await this.notifications.enqueueBookingConfirmation(appointment.id);
```

```310:322:apps/api/src/notifications/notifications.service.ts
    if (record.appointmentId && record.type === NotificationJobType.BOOKING_REMINDER) {
      const appt = await this.prisma.appointment.findUnique({
        where: { id: record.appointmentId },
        select: { status: true },
      });
      if (appt && (appt.status === 'CANCELLED' || appt.status === 'NO_SHOW')) {
        await this.prisma.notificationJob.update({
          where: { id: record.id },
          data: { status: NotificationJobStatus.COMPLETED, processedAt: new Date() },
        });
        return;
      }
    }
```

**Solução**  
Antes de reenfileirar: marcar jobs PENDING de reminder/confirmation daquele `appointmentId` como cancelled/completed e, se possível, remover da fila BullMQ. No worker, comparar `scheduledFor`/`startsAt` atual ou versionar o appointment.

---

### 5. Booking público ignora `SubscriptionStatus` (ex.: PAST_DUE)

| Campo | Valor |
|--------|--------|
| **Gravidade** | Média |
| **Categoria Backend** | Billing / Entitlements |
| **Localização** | `appointments/appointments.service.ts` → `bookPublic`; `billing/billing.service.ts` (`invoice.payment_failed` → `PAST_DUE`) |
| **Esforço** | P–M |

**Problema**  
O book só consulta `subscription.monthlyBookingLimit`. Não há gate para `PAST_DUE`, `CANCELED` ou `INCOMPLETE`. Em `PAST_DUE`, o webhook **não** rebaixa `tenant.plan`, então PIX/WhatsApp (`planAllows*`) continuam ativos.

**Impacto**  
Tenant inadimplente segue com features pagas e agenda pública aberta até intervenção manual ou cancelamento no Stripe.

**Evidência**

```461:473:apps/api/src/appointments/appointments.service.ts
        const limit = tenant.subscription?.monthlyBookingLimit;
        if (limit != null) {
          const monthStart = startOfMonthInTimeZone(new Date(), tenant.timezone);
          const monthCount = await tx.appointment.count({
            where: { tenantId: tenant.id, createdAt: { gte: monthStart } },
          });
          if (monthCount >= limit) {
            throw new ConflictException(
              'Limite de agendamentos do plano atingido este mês. O profissional precisa fazer upgrade.',
            );
          }
        }
```

```312:326:apps/api/src/billing/billing.service.ts
    if (event.type === 'invoice.payment_failed') {
      // ...
        await this.prisma.subscription.updateMany({
          where: { stripeSubscriptionId: stripeSubId },
          data: { status: SubscriptionStatus.PAST_DUE },
        });
```

**Solução**  
Definir política explícita (grace N dias vs. hard block) e aplicar no book + entitlements (`planAllowsPixDeposit` / WhatsApp) com base em `subscription.status`, não só em `tenant.plan`.

---

### 6. Race no register de slug sem tratamento de `P2002`

| Campo | Valor |
|--------|--------|
| **Gravidade** | Baixa |
| **Categoria Backend** | Auth / Errors |
| **Localização** | `auth/auth.service.ts` → `register` |
| **Esforço** | P |

**Problema**  
Check de slug único ocorre fora da transaction; corrida gera unique violation Prisma sem mapear para `ConflictException` (diferente do book, que trata `P2002`).

**Impacto**  
Em alta concorrência, um dos cadastros pode receber 500 em vez de 409 amigável.

**Evidência**

```41:45:apps/api/src/auth/auth.service.ts
    const existingSlug = await this.prisma.tenant.findUnique({ where: { slug: baseSlug } });
    if (existingSlug) {
      throw new ConflictException('Este slug já está em uso');
    }
```

A criação segue em `$transaction` sem `catch` de `P2002` (contrastar com `bookPublic` L574–578).

**Solução**  
Envolver create + catch `P2002` → `ConflictException`, ou unique retry com sufixo.

---

### 7. Query de slots públicos sem DTO/validação

| Campo | Valor |
|--------|--------|
| **Gravidade** | Baixa |
| **Categoria Backend** | Validation |
| **Localização** | `public/public.controller.ts` → `GET :slug/slots` |
| **Esforço** | P |

**Problema**  
`serviceId` e `date` são query strings tipadas como `string` sem `@IsISO8601` / `@Matches` / DTO. Ausência ou formato inválido cai em `NotFound`/comportamento de `Date` inválido em vez de 400 claro.

**Evidência**

```68:77:apps/api/src/public/public.controller.ts
  @Get(':slug/slots')
  slots(
    @Param('slug') slug: string,
    @Query('serviceId') serviceId: string,
    @Query('date') date: string,
    @Query('professionalId') professionalId?: string,
  ) {
    return this.appointments.getPublicSlots(slug, serviceId, date, professionalId);
  }
```

**Solução**  
DTO com `serviceId` obrigatório + `date` `YYYY-MM-DD` (mesmo padrão de `JoinWaitlistDto.dateKey`).

---

## Pontos fortes

- **Anti double-booking:** `pg_advisory_xact_lock` + recheck de overlap com buffer + unique `(professionalId, startsAt)` e mapeamento `P2002` → 409.
- **Máquina de estados** centralizada (`appointment-state.ts`) com testes; bloqueia terminais → COMPLETED (proteção de loyalty/relatórios).
- **PIX lifecycle:** claim atômico PENDING→PAID, reconciliação de expirados/órfãos, assinatura de webhook MP com `timingSafeEqual`, fail-closed se falha ao criar cobrança.
- **Auth:** refresh com rotação atômica + invalidação de família em reuse; cookies httpOnly; forgot-password sem enumeração; reset revoga refresh tokens; JWT `validate` revalida user/tenant no DB.
- **LGPD:** export + exclusão com anonimização de PII, rotação de `manageToken`, limpeza de jobs/tokens, cancel Stripe na exclusão (documentado).
- **Entitlements de plano** centralizados (`plan-entitlements.ts`) usados em booking e notificações.
- **Waitlist:** claim FIFO atômico WAITING→NOTIFIED evita notificação dupla.
- **Loyalty:** crédito idempotente via unique `(appointmentId, type)`.
- **Higiene API:** `ValidationPipe` whitelist/forbid, Helmet, CORS, throttling global + rotas públicas, Swagger off por default em prod, redaction de secrets no logger.

---

## Nota e leitura

| Dimensão | Nota | Comentário |
|----------|------|------------|
| Booking / disponibilidade | 7.5 | Locks e engine bons; furo em `maxAdvanceDays` no write path |
| Payments (PIX) | 5.0 | Lifecycle forte, mas bypass via confirm público anula o sinal |
| Auth / sessão | 8.5 | Refresh e reset bem pensados |
| Billing (Stripe) | 5.5 | Webhooks úteis; downgrade STARTER perigoso |
| LGPD / account | 8.0 | Export/delete coerentes com retenção financeira |
| Consistência / edge cases | 6.0 | Reminders e status de assinatura ainda frouxos |
| **Geral** | **6.5** | Pronto para iterar; **não** shipar PIX deposit sem fechar o item 1 |

**Prioridade sugerida:** corrigir (1) e (2) antes de qualquer rollout com sinal online ou self-serve de plano; em seguida (3)–(5).
