import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AppointmentStatus, Prisma } from '@prisma/client';
import {
  ACTIVE_APPOINTMENT_STATUSES,
  computeDaySlots,
  hasOverlap,
  toDateKey,
} from '../common/availability/availability.engine';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { BookPublicDto } from './dto/appointment.dto';

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  list(tenantId: string, from?: string, to?: string) {
    const where: Prisma.AppointmentWhereInput = { tenantId };
    if (from || to) {
      where.startsAt = {};
      if (from) where.startsAt.gte = new Date(from);
      if (to) where.startsAt.lte = new Date(to);
    }
    return this.prisma.appointment.findMany({
      where,
      include: {
        client: true,
        service: true,
        professional: { select: { id: true, name: true } },
      },
      orderBy: { startsAt: 'asc' },
    });
  }

  async updateStatus(tenantId: string, id: string, status: AppointmentStatus) {
    const appt = await this.prisma.appointment.findFirst({ where: { id, tenantId } });
    if (!appt) throw new NotFoundException('Agendamento não encontrado');

    return this.prisma.appointment.update({
      where: { id },
      data: {
        status,
        cancelledAt: status === AppointmentStatus.CANCELLED ? new Date() : appt.cancelledAt,
      },
    });
  }

  async getPublicProfile(slug: string) {
    const tenant = await this.prisma.tenant.findFirst({
      where: { slug, deletedAt: null },
      select: {
        id: true,
        slug: true,
        name: true,
        timezone: true,
        services: {
          where: { isActive: true, deletedAt: null },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          select: {
            id: true,
            name: true,
            description: true,
            durationMinutes: true,
            priceCents: true,
            depositCents: true,
          },
        },
      },
    });
    if (!tenant) throw new NotFoundException('Profissional não encontrado');
    return tenant;
  }

  async getPublicSlots(slug: string, serviceId: string, dateKey: string) {
    const tenant = await this.prisma.tenant.findFirst({
      where: { slug, deletedAt: null },
    });
    if (!tenant) throw new NotFoundException('Profissional não encontrado');

    const service = await this.prisma.service.findFirst({
      where: { id: serviceId, tenantId: tenant.id, isActive: true, deletedAt: null },
    });
    if (!service) throw new NotFoundException('Serviço não encontrado');

    const professional = await this.prisma.user.findFirst({
      where: { tenantId: tenant.id, role: 'OWNER', deletedAt: null, isActive: true },
    });
    if (!professional) throw new NotFoundException('Profissional indisponível');

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

    const slots = computeDaySlots({
      dateKey,
      timeZone: tenant.timezone,
      durationMinutes: service.durationMinutes,
      rules,
      exceptions: exceptions.map((e) => ({
        dateKey: toDateKey(e.date, tenant.timezone),
        isAvailable: e.isAvailable,
        startMinute: e.startMinute,
        endMinute: e.endMinute,
      })),
      busy: busyAppts,
    });

    return {
      date: dateKey,
      timezone: tenant.timezone,
      serviceId: service.id,
      slots: slots.map((s) => s.toISOString()),
    };
  }

  /**
   * Booking público com prevenção de double-booking:
   * 1) advisory lock por profissional
   * 2) revalida overlap dentro da transaction
   * 3) unique (professionalId, startsAt) como rede de segurança
   */
  async bookPublic(slug: string, dto: BookPublicDto) {
    const tenant = await this.prisma.tenant.findFirst({
      where: { slug, deletedAt: null },
      include: { subscription: true },
    });
    if (!tenant) throw new NotFoundException('Profissional não encontrado');

    const service = await this.prisma.service.findFirst({
      where: { id: dto.serviceId, tenantId: tenant.id, isActive: true, deletedAt: null },
    });
    if (!service) throw new NotFoundException('Serviço não encontrado');

    const professional = await this.prisma.user.findFirst({
      where: { tenantId: tenant.id, role: 'OWNER', deletedAt: null, isActive: true },
    });
    if (!professional) throw new NotFoundException('Profissional indisponível');

    const startsAt = new Date(dto.startsAt);
    if (Number.isNaN(startsAt.getTime())) {
      throw new BadRequestException('startsAt inválido');
    }
    if (startsAt.getTime() <= Date.now()) {
      throw new BadRequestException('Não é possível agendar no passado');
    }

    const endsAt = new Date(startsAt.getTime() + service.durationMinutes * 60_000);
    const dateKey = toDateKey(startsAt, tenant.timezone);

    // Valida que o horário ainda é um slot válido
    const slotCheck = await this.getPublicSlots(slug, service.id, dateKey);
    if (!slotCheck.slots.includes(startsAt.toISOString())) {
      throw new ConflictException('Horário indisponível');
    }

    try {
      const appointment = await this.prisma.$transaction(async (tx) => {
        // Lock advisory baseado no hash do professionalId (evita race entre requests)
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${professional.id}))`;

        const busy = await tx.appointment.findMany({
          where: {
            professionalId: professional.id,
            status: { in: ACTIVE_APPOINTMENT_STATUSES },
            startsAt: { lt: endsAt },
            endsAt: { gt: startsAt },
          },
          select: { startsAt: true, endsAt: true },
        });

        if (hasOverlap(startsAt, endsAt, busy)) {
          throw new ConflictException('Horário acabou de ser reservado');
        }

        const existingClient = await tx.client.findFirst({
          where: { tenantId: tenant.id, phone: dto.clientPhone, deletedAt: null },
        });
        const client = existingClient
          ? await tx.client.update({
              where: { id: existingClient.id },
              data: {
                name: dto.clientName,
                email: dto.clientEmail ?? existingClient.email,
              },
            })
          : await tx.client.create({
              data: {
                tenantId: tenant.id,
                name: dto.clientName,
                phone: dto.clientPhone,
                email: dto.clientEmail,
              },
            });

        const status =
          service.depositCents > 0
            ? AppointmentStatus.PENDING_PAYMENT
            : AppointmentStatus.SCHEDULED;

        return tx.appointment.create({
          data: {
            tenantId: tenant.id,
            professionalId: professional.id,
            clientId: client.id,
            serviceId: service.id,
            startsAt,
            endsAt,
            status,
            customerNotes: dto.notes,
            priceCentsSnapshot: service.priceCents,
            durationMinutesSnapshot: service.durationMinutes,
          },
          include: { client: true, service: true },
        });
      });

      await this.notifications.enqueueBookingConfirmation(appointment.id);

      return appointment;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Horário acabou de ser reservado');
      }
      throw error;
    }
  }
}
