import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AppointmentStatus, PixChargeStatus } from '@prisma/client';
import { notifyNextWaitlistCandidate } from '../common/waitlist/notify-next';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

const RECONCILE_INTERVAL_MS = 60_000;
const FALLBACK_PENDING_TTL_MS = 30 * 60_000;

export type ConfirmPaidResult = 'confirmed' | 'already_paid' | 'skipped' | 'paid_orphan';

/**
 * Libera slots travados em PENDING_PAYMENT quando o PIX expira/cancela (C-02).
 * Confirma pagamento de forma atômica (idempotente) — webhook duplicado não
 * re-notifica nem reconfirma (Fase 4).
 */
@Injectable()
export class PixLifecycleService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PixLifecycleService.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit() {
    void this.reconcileExpired().catch((err) =>
      this.logger.warn(`Reconciliação PIX inicial falhou: ${(err as Error).message}`),
    );
    this.timer = setInterval(() => {
      void this.reconcileExpired().catch((err) =>
        this.logger.warn(`Reconciliação PIX falhou: ${(err as Error).message}`),
      );
    }, RECONCILE_INTERVAL_MS);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /**
   * Claim atômico PENDING → PAID. Só o primeiro vencedor confirma appointment e notifica.
   * Webhook/replay duplicado retorna `already_paid` sem side-effects.
   */
  async confirmPaid(appointmentId: string): Promise<ConfirmPaidResult> {
    const outcome = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.pixCharge.updateMany({
        where: { appointmentId, status: PixChargeStatus.PENDING },
        data: { status: PixChargeStatus.PAID, paidAt: new Date() },
      });

      if (claimed.count === 0) {
        const existing = await tx.pixCharge.findUnique({
          where: { appointmentId },
          select: { status: true },
        });
        if (existing?.status === PixChargeStatus.PAID) return 'already_paid' as const;
        return 'skipped' as const;
      }

      const confirmed = await tx.appointment.updateMany({
        where: { id: appointmentId, status: AppointmentStatus.PENDING_PAYMENT },
        data: { status: AppointmentStatus.CONFIRMED },
      });

      if (confirmed.count === 0) return 'paid_orphan' as const;
      return 'confirmed' as const;
    });

    this.logger.log(
      JSON.stringify({
        event: 'pix.confirm',
        appointmentId,
        outcome,
      }),
    );

    if (outcome === 'confirmed') {
      await this.notifications.enqueueBookingConfirmation(appointmentId);
    } else if (outcome === 'paid_orphan') {
      this.logger.warn(
        `PIX pago mas appointment ${appointmentId} não estava PENDING_PAYMENT — cobrança marcada PAID; revisar reembolso manual se necessário`,
      );
    }

    return outcome;
  }

  /**
   * Cancela agendamento PENDING_PAYMENT e marca a cobrança (EXPIRED ou CANCELLED).
   * Idempotente: charge já terminal (PAID/EXPIRED/CANCELLED/REFUNDED) + appointment
   * não pendente → no-op.
   */
  async releasePendingPayment(
    appointmentId: string,
    reason: string,
    chargeStatus: 'EXPIRED' | 'CANCELLED' = PixChargeStatus.EXPIRED,
  ): Promise<boolean> {
    const appt = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        tenant: { select: { id: true, name: true, slug: true, timezone: true } },
        pixCharge: true,
      },
    });
    if (!appt) return false;

    const wasPending = appt.status === AppointmentStatus.PENDING_PAYMENT;
    const canExpireCharge =
      Boolean(appt.pixCharge) && appt.pixCharge!.status === PixChargeStatus.PENDING;

    if (!wasPending && !canExpireCharge) return false;

    await this.prisma.$transaction(async (tx) => {
      if (canExpireCharge && appt.pixCharge) {
        await tx.pixCharge.updateMany({
          where: { id: appt.pixCharge.id, status: PixChargeStatus.PENDING },
          data: { status: chargeStatus },
        });
      }
      if (wasPending) {
        await tx.appointment.updateMany({
          where: { id: appt.id, status: AppointmentStatus.PENDING_PAYMENT },
          data: {
            status: AppointmentStatus.CANCELLED,
            cancelledAt: new Date(),
            cancelReason: reason.slice(0, 255),
          },
        });
      }
    });

    this.logger.log(
      JSON.stringify({
        event: 'pix.release',
        appointmentId,
        chargeStatus,
        wasPending,
        reason: reason.slice(0, 120),
      }),
    );

    if (wasPending) {
      await notifyNextWaitlistCandidate(
        this.prisma,
        this.notifications,
        appt.tenantId,
        appt.startsAt,
        appt.tenant,
      );
      this.logger.log(`Slot liberado — appointment ${appointmentId} (${reason})`);
    }
    return wasPending;
  }

  /** Marca cobrança PAID → REFUNDED (não altera appointment). Idempotente. */
  async markRefunded(appointmentId: string): Promise<boolean> {
    const updated = await this.prisma.pixCharge.updateMany({
      where: { appointmentId, status: PixChargeStatus.PAID },
      data: { status: PixChargeStatus.REFUNDED },
    });
    this.logger.log(
      JSON.stringify({
        event: 'pix.refunded',
        appointmentId,
        updated: updated.count,
      }),
    );
    return updated.count > 0;
  }

  async reconcileExpired(): Promise<number> {
    const now = new Date();
    const expiredCharges = await this.prisma.pixCharge.findMany({
      where: {
        status: PixChargeStatus.PENDING,
        OR: [
          { expiresAt: { lte: now } },
          {
            expiresAt: null,
            createdAt: { lte: new Date(now.getTime() - FALLBACK_PENDING_TTL_MS) },
          },
        ],
      },
      select: { appointmentId: true },
      take: 100,
    });

    const orphanPending = await this.prisma.appointment.findMany({
      where: {
        status: AppointmentStatus.PENDING_PAYMENT,
        createdAt: { lte: new Date(now.getTime() - FALLBACK_PENDING_TTL_MS) },
        OR: [
          { pixCharge: null },
          {
            pixCharge: {
              status: {
                in: [PixChargeStatus.EXPIRED, PixChargeStatus.CANCELLED, PixChargeStatus.PENDING],
              },
            },
          },
        ],
      },
      select: { id: true },
      take: 100,
    });

    const ids = new Set([
      ...expiredCharges.map((c) => c.appointmentId),
      ...orphanPending.map((a) => a.id),
    ]);

    let released = 0;
    for (const appointmentId of ids) {
      const ok = await this.releasePendingPayment(
        appointmentId,
        'PIX expirado ou cancelado — horário liberado',
        PixChargeStatus.EXPIRED,
      );
      if (ok) released += 1;
    }
    if (released > 0) {
      this.logger.log(`Reconciliação PIX: ${released} slot(s) liberado(s)`);
    }
    return released;
  }
}
