import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AppointmentStatus, PixChargeStatus, Prisma } from '@prisma/client';
import { ACTIVE_APPOINTMENT_STATUSES } from '../common/availability/availability.engine';
import {
  DEFAULT_APPOINTMENTS_PAGE_SIZE,
  normalizePage,
  normalizePageSize,
  type PageResult,
} from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { assertValidTransition } from './appointment-state';
import { AppointmentSideEffectsService } from './appointment-side-effects.service';

const APPOINTMENT_LIST_SELECT = {
  id: true,
  startsAt: true,
  endsAt: true,
  status: true,
  priceCentsSnapshot: true,
  durationMinutesSnapshot: true,
  customerNotes: true,
  createdAt: true,
  client: { select: { id: true, name: true, phone: true, email: true } },
  service: {
    select: { id: true, name: true, durationMinutes: true, priceCents: true, depositCents: true },
  },
  professional: { select: { id: true, name: true } },
  pixCharge: { select: { status: true, amountCents: true } },
} satisfies Prisma.AppointmentSelect;

export type AppointmentListItem = Prisma.AppointmentGetPayload<{
  select: typeof APPOINTMENT_LIST_SELECT;
}>;

@Injectable()
export class AppointmentLifecycleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly loyalty: LoyaltyService,
    private readonly sideEffects: AppointmentSideEffectsService,
  ) {}

  /**
   * Lista paginada (default pageSize=100, max=100).
   * Breaking: resposta deixa de ser array cru → `{ items, total, page, pageSize }`.
   * MEMBER: sempre restrito a `professionalId === actor.userId` (ignora filtro alheio).
   */
  async list(
    tenantId: string,
    opts: {
      from?: string;
      to?: string;
      professionalId?: string;
      page?: number;
      pageSize?: number;
      /** Escopo AuthZ — MEMBER só vê a própria agenda */
      actor?: { userId: string; role: string };
    } = {},
  ): Promise<PageResult<AppointmentListItem>> {
    const page = normalizePage(opts.page);
    const pageSize = normalizePageSize(opts.pageSize, DEFAULT_APPOINTMENTS_PAGE_SIZE);
    const where: Prisma.AppointmentWhereInput = { tenantId };
    const isMember = opts.actor?.role === 'MEMBER';
    if (isMember && opts.actor) {
      where.professionalId = opts.actor.userId;
    } else if (opts.professionalId) {
      where.professionalId = opts.professionalId;
    }
    if (opts.from || opts.to) {
      where.startsAt = {};
      if (opts.from) where.startsAt.gte = new Date(opts.from);
      if (opts.to) where.startsAt.lte = new Date(opts.to);
    }

    const [items, total] = await Promise.all([
      this.prisma.appointment.findMany({
        where,
        select: APPOINTMENT_LIST_SELECT,
        orderBy: { startsAt: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.appointment.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async updateStatus(tenantId: string, id: string, status: AppointmentStatus) {
    const appt = await this.prisma.appointment.findFirst({
      where: { id, tenantId },
      include: {
        tenant: true,
        service: { select: { id: true, name: true, durationMinutes: true } },
        pixCharge: { select: { status: true } },
      },
    });
    if (!appt) throw new NotFoundException('Agendamento não encontrado');

    // Bloqueia staff de furar sinal PIX (FSM já impede; defesa explícita + mensagem clara)
    if (
      appt.status === AppointmentStatus.PENDING_PAYMENT &&
      (status === AppointmentStatus.CONFIRMED || status === AppointmentStatus.SCHEDULED)
    ) {
      const paid = appt.pixCharge?.status === PixChargeStatus.PAID;
      if (!paid) {
        throw new BadRequestException(
          'Agendamento aguardando pagamento do sinal PIX — só confirma automaticamente após o pagamento.',
        );
      }
    }

    assertValidTransition(appt.status, status);

    const becameCompleted =
      status === AppointmentStatus.COMPLETED && appt.status !== AppointmentStatus.COMPLETED;

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.appointment.update({
        where: { id },
        data: {
          status,
          cancelledAt: status === AppointmentStatus.CANCELLED ? new Date() : appt.cancelledAt,
        },
      });

      // Fidelidade: ledger idempotente (unique appointmentId+CREDIT)
      if (becameCompleted) {
        await this.loyalty.creditForCompletedAppointment(
          {
            tenantId: appt.tenantId,
            clientId: appt.clientId,
            appointmentId: appt.id,
            priceCents: appt.priceCentsSnapshot,
            pointsPerReal: appt.tenant.loyaltyPointsPerReal,
            loyaltyEnabled: appt.tenant.loyaltyEnabled,
          },
          tx,
        );
      }

      return row;
    });

    if (status === AppointmentStatus.CANCELLED && appt.status !== AppointmentStatus.CANCELLED) {
      await this.sideEffects.onCancelled({
        appointmentId: id,
        tenantId: appt.tenantId,
        startsAt: appt.startsAt,
        cancelledBy: 'professional',
        tenant: appt.tenant,
      });
    }

    // Retenção: após COMPLETED, sugere remarcar (API; UI opcional)
    if (becameCompleted) {
      const hasUpcoming = await this.prisma.appointment.findFirst({
        where: {
          tenantId,
          clientId: appt.clientId,
          id: { not: appt.id },
          status: { in: [...ACTIVE_APPOINTMENT_STATUSES] },
          startsAt: { gt: new Date() },
        },
        select: { id: true },
      });

      return {
        ...updated,
        rebookingSuggested: !hasUpcoming,
        rebooking: !hasUpcoming
          ? {
              clientId: appt.clientId,
              serviceId: appt.serviceId,
              serviceName: appt.service.name,
              suggestedAfterDays: 30,
              message: 'Sugestão: remarcar o próximo atendimento deste cliente.',
            }
          : null,
      };
    }

    return { ...updated, rebookingSuggested: false, rebooking: null };
  }
}
