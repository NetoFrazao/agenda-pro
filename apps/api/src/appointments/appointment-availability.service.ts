import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Tenant, User } from '@prisma/client';
import {
  ACTIVE_APPOINTMENT_STATUSES,
  computeDaySlots,
  dateOnlyToDateKey,
  toDateKey,
} from '../common/availability/availability.engine';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AppointmentAvailabilityService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveProfessional(tenantId: string, professionalId?: string): Promise<User> {
    const professional = professionalId
      ? await this.prisma.user.findFirst({
          where: { id: professionalId, tenantId, deletedAt: null, isActive: true },
        })
      : await this.prisma.user.findFirst({
          where: { tenantId, role: 'OWNER', deletedAt: null, isActive: true },
        });
    if (!professional) throw new NotFoundException('Profissional indisponível');
    return professional;
  }

  async computeSlotsFor(
    tenant: Tenant,
    professional: User,
    durationMinutes: number,
    dateKey: string,
  ): Promise<Date[]> {
    const dayStart = new Date(`${dateKey}T00:00:00.000Z`);
    const dayEnd = new Date(`${dateKey}T23:59:59.999Z`);
    // Janela ampla em UTC para cobrir o dia civil no fuso do tenant
    const rangeStart = new Date(dayStart.getTime() - 12 * 3600_000);
    const rangeEnd = new Date(dayEnd.getTime() + 12 * 3600_000);

    const [rules, exceptions, busyAppts] = await Promise.all([
      this.prisma.availabilityRule.findMany({
        where: {
          tenantId: tenant.id,
          isActive: true,
          OR: [{ professionalId: null }, { professionalId: professional.id }],
        },
      }),
      this.prisma.availabilityException.findMany({
        where: {
          tenantId: tenant.id,
          date: new Date(dateKey),
          OR: [{ professionalId: null }, { professionalId: professional.id }],
        },
      }),
      this.prisma.appointment.findMany({
        where: {
          tenantId: tenant.id,
          professionalId: professional.id,
          status: { in: ACTIVE_APPOINTMENT_STATUSES },
          startsAt: { lt: rangeEnd },
          endsAt: { gt: rangeStart },
        },
        select: { startsAt: true, endsAt: true },
      }),
    ]);

    return computeDaySlots({
      dateKey,
      timeZone: tenant.timezone,
      durationMinutes,
      stepMinutes: tenant.slotGridMinutes,
      bufferMinutes: tenant.bufferMinutes,
      minNoticeMinutes: tenant.minNoticeMinutes,
      rules,
      exceptions: exceptions.map((e) => ({
        // @db.Date: extrair civil UTC, não via timezone do tenant
        dateKey: dateOnlyToDateKey(e.date),
        isAvailable: e.isAvailable,
        startMinute: e.startMinute,
        endMinute: e.endMinute,
      })),
      busy: busyAppts,
    });
  }

  assertWithinBookingWindow(
    startsAt: Date,
    tenant: { minNoticeMinutes: number; maxAdvanceDays: number; timezone: string },
  ) {
    if (startsAt.getTime() <= Date.now() + tenant.minNoticeMinutes * 60_000) {
      throw new BadRequestException(
        `Este horário exige agendamento com pelo menos ${tenant.minNoticeMinutes} minutos de antecedência`,
      );
    }
    const maxDate = new Date(Date.now() + tenant.maxAdvanceDays * 86_400_000);
    if (toDateKey(startsAt, tenant.timezone) > toDateKey(maxDate, tenant.timezone)) {
      throw new BadRequestException(
        `Agendamentos só são aceitos com até ${tenant.maxAdvanceDays} dias de antecedência`,
      );
    }
  }
}
