import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AppointmentStatus, Prisma, WaitlistStatus, type Tenant, type User } from '@prisma/client';
import {
  ACTIVE_APPOINTMENT_STATUSES,
  computeDaySlots,
  hasOverlap,
  toDateKey,
} from '../common/availability/availability.engine';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MercadoPagoService } from '../payments/mercadopago.service';
import { EnvService } from '../config/env.service';
import { BookPublicDto, PublicReviewDto, RescheduleDto } from './dto/appointment.dto';

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly mercadoPago: MercadoPagoService,
    private readonly env: EnvService,
  ) {}

  list(tenantId: string, from?: string, to?: string, professionalId?: string) {
    const where: Prisma.AppointmentWhereInput = { tenantId };
    if (professionalId) where.professionalId = professionalId;
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
        pixCharge: { select: { status: true, amountCents: true } },
      },
      orderBy: { startsAt: 'asc' },
      take: 500,
    });
  }

  async updateStatus(tenantId: string, id: string, status: AppointmentStatus) {
    const appt = await this.prisma.appointment.findFirst({
      where: { id, tenantId },
      include: { tenant: true },
    });
    if (!appt) throw new NotFoundException('Agendamento não encontrado');

    const updated = await this.prisma.appointment.update({
      where: { id },
      data: {
        status,
        cancelledAt: status === AppointmentStatus.CANCELLED ? new Date() : appt.cancelledAt,
      },
    });

    // Fidelidade: pontos por atendimento concluído (1ª conclusão apenas)
    if (
      status === AppointmentStatus.COMPLETED &&
      appt.status !== AppointmentStatus.COMPLETED &&
      appt.tenant.loyaltyEnabled
    ) {
      const points = Math.floor(appt.priceCentsSnapshot / 100) * appt.tenant.loyaltyPointsPerReal;
      if (points > 0) {
        await this.prisma.client.update({
          where: { id: appt.clientId },
          data: { loyaltyPoints: { increment: points } },
        });
      }
    }

    if (status === AppointmentStatus.CANCELLED && appt.status !== AppointmentStatus.CANCELLED) {
      await this.notifications.enqueueBookingCancelled(id, 'professional');
      await this.notifyWaitlist(appt.tenantId, appt.startsAt, appt.tenant);
    }

    return updated;
  }

  async getPublicProfile(slug: string) {
    const tenant = await this.prisma.tenant.findFirst({
      where: { slug, deletedAt: null },
      select: {
        id: true,
        slug: true,
        name: true,
        timezone: true,
        about: true,
        address: true,
        whatsapp: true,
        maxAdvanceDays: true,
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
        users: {
          where: { isActive: true, deletedAt: null },
          orderBy: { createdAt: 'asc' },
          select: { id: true, name: true, role: true },
        },
      },
    });
    if (!tenant) throw new NotFoundException('Profissional não encontrado');

    const [ratingAgg, recentReviews] = await Promise.all([
      this.prisma.review.aggregate({
        where: { tenantId: tenant.id, isPublished: true },
        _avg: { rating: true },
        _count: true,
      }),
      this.prisma.review.findMany({
        where: { tenantId: tenant.id, isPublished: true },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { rating: true, comment: true, clientName: true, createdAt: true },
      }),
    ]);

    const { users, ...rest } = tenant;
    return {
      ...rest,
      professionals: users,
      rating: {
        average: ratingAgg._avg.rating ? Number(ratingAgg._avg.rating.toFixed(1)) : null,
        count: ratingAgg._count,
      },
      reviews: recentReviews,
    };
  }

  async getPublicSlots(slug: string, serviceId: string, dateKey: string, professionalId?: string) {
    const tenant = await this.prisma.tenant.findFirst({
      where: { slug, deletedAt: null },
    });
    if (!tenant) throw new NotFoundException('Profissional não encontrado');

    const service = await this.prisma.service.findFirst({
      where: { id: serviceId, tenantId: tenant.id, isActive: true, deletedAt: null },
    });
    if (!service) throw new NotFoundException('Serviço não encontrado');

    const professional = await this.resolveProfessional(tenant.id, professionalId);

    // Janela máxima de agendamento futuro (regra do estabelecimento)
    const maxDate = new Date(Date.now() + tenant.maxAdvanceDays * 86_400_000);
    if (dateKey > toDateKey(maxDate, tenant.timezone)) {
      return {
        date: dateKey,
        timezone: tenant.timezone,
        serviceId: service.id,
        professionalId: professional.id,
        slots: [],
      };
    }

    const slots = await this.computeSlotsFor(
      tenant,
      professional,
      service.durationMinutes,
      dateKey,
    );

    return {
      date: dateKey,
      timezone: tenant.timezone,
      serviceId: service.id,
      professionalId: professional.id,
      slots: slots.map((s) => s.toISOString()),
    };
  }

  private async resolveProfessional(tenantId: string, professionalId?: string): Promise<User> {
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

  private async computeSlotsFor(
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
        dateKey: toDateKey(e.date, tenant.timezone),
        isAvailable: e.isAvailable,
        startMinute: e.startMinute,
        endMinute: e.endMinute,
      })),
      busy: busyAppts,
    });
  }

  /**
   * Booking público com prevenção de double-booking:
   * 1) advisory lock por profissional
   * 2) revalida overlap dentro da transaction (com buffer)
   * 3) unique (professionalId, startsAt) como rede de segurança
   * Também aplica o limite mensal do plano e cria a cobrança PIX do sinal.
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

    const professional = await this.resolveProfessional(tenant.id, dto.professionalId);

    const startsAt = new Date(dto.startsAt);
    if (Number.isNaN(startsAt.getTime())) {
      throw new BadRequestException('startsAt inválido');
    }
    if (startsAt.getTime() <= Date.now() + tenant.minNoticeMinutes * 60_000) {
      throw new BadRequestException(
        `Este horário exige agendamento com pelo menos ${tenant.minNoticeMinutes} minutos de antecedência`,
      );
    }

    const endsAt = new Date(startsAt.getTime() + service.durationMinutes * 60_000);
    const dateKey = toDateKey(startsAt, tenant.timezone);

    // Valida que o horário ainda é um slot válido (regras + grade + buffer)
    const validSlots = await this.computeSlotsFor(
      tenant,
      professional,
      service.durationMinutes,
      dateKey,
    );
    if (!validSlots.some((s) => s.getTime() === startsAt.getTime())) {
      throw new ConflictException('Horário indisponível');
    }

    const useOnlineDeposit = service.depositCents > 0 && this.mercadoPago.isConfigured;

    try {
      const appointment = await this.prisma.$transaction(async (tx) => {
        // Lock advisory baseado no hash do professionalId (evita race entre requests)
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${professional.id}))`;

        // Limite mensal do plano (agendamentos criados no mês corrente)
        const limit = tenant.subscription?.monthlyBookingLimit;
        if (limit != null) {
          const monthStart = new Date();
          monthStart.setUTCDate(1);
          monthStart.setUTCHours(0, 0, 0, 0);
          const monthCount = await tx.appointment.count({
            where: { tenantId: tenant.id, createdAt: { gte: monthStart } },
          });
          if (monthCount >= limit) {
            throw new ConflictException(
              'Limite de agendamentos do plano atingido este mês. O profissional precisa fazer upgrade.',
            );
          }
        }

        const busy = await tx.appointment.findMany({
          where: {
            professionalId: professional.id,
            status: { in: ACTIVE_APPOINTMENT_STATUSES },
            startsAt: { lt: new Date(endsAt.getTime() + tenant.bufferMinutes * 60_000) },
            endsAt: { gt: new Date(startsAt.getTime() - tenant.bufferMinutes * 60_000) },
          },
          select: { startsAt: true, endsAt: true },
        });

        if (hasOverlap(startsAt, endsAt, busy, tenant.bufferMinutes)) {
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

        return tx.appointment.create({
          data: {
            tenantId: tenant.id,
            professionalId: professional.id,
            clientId: client.id,
            serviceId: service.id,
            startsAt,
            endsAt,
            // Sinal online: fica pendente até o webhook do PIX confirmar
            status: useOnlineDeposit
              ? AppointmentStatus.PENDING_PAYMENT
              : AppointmentStatus.SCHEDULED,
            customerNotes: dto.notes,
            priceCentsSnapshot: service.priceCents,
            durationMinutesSnapshot: service.durationMinutes,
          },
          include: { client: true, service: true },
        });
      });

      // Marca entrada da lista de espera desse cliente como atendida
      await this.prisma.waitlistEntry.updateMany({
        where: {
          tenantId: tenant.id,
          dateKey,
          clientPhone: dto.clientPhone,
          status: { in: [WaitlistStatus.WAITING, WaitlistStatus.NOTIFIED] },
        },
        data: { status: WaitlistStatus.BOOKED },
      });

      let pix: Record<string, unknown> | null = null;
      if (useOnlineDeposit) {
        pix = await this.createDepositCharge(appointment.id, tenant, service.depositCents, dto);
      } else {
        await this.notifications.enqueueBookingConfirmation(appointment.id);
      }

      return {
        ...appointment,
        manageUrl: `${this.env.appPublicUrl}/agendamento/${appointment.manageToken}`,
        pix,
        depositCents: service.depositCents,
        depositMode: useOnlineDeposit ? 'pix' : service.depositCents > 0 ? 'local' : null,
      };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Horário acabou de ser reservado');
      }
      throw error;
    }
  }

  private async createDepositCharge(
    appointmentId: string,
    tenant: Tenant,
    amountCents: number,
    dto: BookPublicDto,
  ) {
    try {
      const charge = await this.mercadoPago.createPixCharge({
        amountCents,
        description: `Sinal — ${tenant.name}`,
        payerEmail: dto.clientEmail ?? null,
        payerName: dto.clientName,
        externalReference: appointmentId,
      });
      await this.prisma.pixCharge.create({
        data: {
          tenantId: tenant.id,
          appointmentId,
          providerRef: charge.providerRef,
          amountCents,
          copyPaste: charge.copyPaste,
          qrCodeBase64: charge.qrCodeBase64,
          expiresAt: charge.expiresAt,
        },
      });
      return {
        copyPaste: charge.copyPaste,
        qrCodeBase64: charge.qrCodeBase64,
        ticketUrl: charge.ticketUrl,
        amountCents,
        expiresAt: charge.expiresAt?.toISOString() ?? null,
      };
    } catch {
      // Falha no PSP não pode matar o booking: degrada para "pagar no local"
      await this.prisma.appointment.update({
        where: { id: appointmentId },
        data: { status: AppointmentStatus.SCHEDULED },
      });
      await this.notifications.enqueueBookingConfirmation(appointmentId);
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Auto-gestão pelo cliente (link com manageToken — sem login)
  // ---------------------------------------------------------------------------

  private async findByManageToken(token: string) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { manageToken: token },
      include: {
        client: { select: { name: true, phone: true, email: true } },
        service: { select: { id: true, name: true, durationMinutes: true, priceCents: true } },
        professional: { select: { id: true, name: true } },
        tenant: {
          select: {
            slug: true,
            name: true,
            timezone: true,
            address: true,
            whatsapp: true,
            cancelMinHours: true,
          },
        },
        pixCharge: {
          select: {
            status: true,
            amountCents: true,
            copyPaste: true,
            qrCodeBase64: true,
            expiresAt: true,
          },
        },
        review: { select: { rating: true, comment: true } },
      },
    });
    if (!appointment) throw new NotFoundException('Agendamento não encontrado');
    return appointment;
  }

  async getByManageToken(token: string) {
    const appointment = await this.findByManageToken(token);
    const canCancelUntil = new Date(
      appointment.startsAt.getTime() - appointment.tenant.cancelMinHours * 3_600_000,
    );
    return {
      ...appointment,
      canCancel:
        ACTIVE_APPOINTMENT_STATUSES.includes(appointment.status) && new Date() < canCancelUntil,
      canCancelUntil: canCancelUntil.toISOString(),
      canReview: appointment.status === AppointmentStatus.COMPLETED && appointment.review === null,
    };
  }

  async confirmByToken(token: string) {
    const appointment = await this.findByManageToken(token);
    if (appointment.status !== AppointmentStatus.SCHEDULED) {
      return { ok: true, status: appointment.status };
    }
    await this.prisma.appointment.update({
      where: { id: appointment.id },
      data: { status: AppointmentStatus.CONFIRMED },
    });
    return { ok: true, status: AppointmentStatus.CONFIRMED };
  }

  async cancelByToken(token: string, reason?: string) {
    const appointment = await this.findByManageToken(token);
    if (!ACTIVE_APPOINTMENT_STATUSES.includes(appointment.status)) {
      throw new BadRequestException('Este agendamento não pode mais ser cancelado');
    }

    const limitMs = appointment.tenant.cancelMinHours * 3_600_000;
    if (appointment.startsAt.getTime() - Date.now() < limitMs) {
      throw new BadRequestException(
        `Cancelamento online permitido até ${appointment.tenant.cancelMinHours}h antes. Fale direto com o estabelecimento.`,
      );
    }

    await this.prisma.appointment.update({
      where: { id: appointment.id },
      data: {
        status: AppointmentStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelReason: reason?.slice(0, 255) ?? 'Cancelado pelo cliente',
      },
    });

    await this.notifications.enqueueBookingCancelled(appointment.id, 'client');
    const tenant = await this.prisma.tenant.findUnique({ where: { id: appointment.tenantId } });
    if (tenant) {
      await this.notifyWaitlist(appointment.tenantId, appointment.startsAt, tenant);
    }

    return { ok: true };
  }

  async rescheduleByToken(token: string, dto: RescheduleDto) {
    const appointment = await this.findByManageToken(token);
    if (!ACTIVE_APPOINTMENT_STATUSES.includes(appointment.status)) {
      throw new BadRequestException('Este agendamento não pode mais ser remarcado');
    }

    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: appointment.tenantId },
    });
    const limitMs = tenant.cancelMinHours * 3_600_000;
    if (appointment.startsAt.getTime() - Date.now() < limitMs) {
      throw new BadRequestException(
        `Remarcação online permitida até ${tenant.cancelMinHours}h antes. Fale direto com o estabelecimento.`,
      );
    }

    const professional = await this.resolveProfessional(tenant.id, appointment.professional.id);
    const newStartsAt = new Date(dto.startsAt);
    if (Number.isNaN(newStartsAt.getTime())) {
      throw new BadRequestException('startsAt inválido');
    }
    const newEndsAt = new Date(
      newStartsAt.getTime() + appointment.durationMinutesSnapshot * 60_000,
    );
    const dateKey = toDateKey(newStartsAt, tenant.timezone);

    const validSlots = await this.computeSlotsFor(
      tenant,
      professional,
      appointment.durationMinutesSnapshot,
      dateKey,
    );
    if (!validSlots.some((s) => s.getTime() === newStartsAt.getTime())) {
      throw new ConflictException('Horário indisponível');
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${professional.id}))`;

        const busy = await tx.appointment.findMany({
          where: {
            professionalId: professional.id,
            id: { not: appointment.id },
            status: { in: ACTIVE_APPOINTMENT_STATUSES },
            startsAt: { lt: new Date(newEndsAt.getTime() + tenant.bufferMinutes * 60_000) },
            endsAt: { gt: new Date(newStartsAt.getTime() - tenant.bufferMinutes * 60_000) },
          },
          select: { startsAt: true, endsAt: true },
        });
        if (hasOverlap(newStartsAt, newEndsAt, busy, tenant.bufferMinutes)) {
          throw new ConflictException('Horário acabou de ser reservado');
        }

        await tx.appointment.update({
          where: { id: appointment.id },
          data: {
            startsAt: newStartsAt,
            endsAt: newEndsAt,
            status:
              appointment.status === AppointmentStatus.PENDING_PAYMENT
                ? appointment.status
                : AppointmentStatus.SCHEDULED,
          },
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Horário acabou de ser reservado');
      }
      throw error;
    }

    // Horário antigo abriu: avisa a lista de espera e reenvia confirmação
    await this.notifyWaitlist(appointment.tenantId, appointment.startsAt, tenant);
    await this.notifications.enqueueBookingConfirmation(appointment.id);

    return { ok: true, startsAt: newStartsAt.toISOString() };
  }

  async reviewByToken(token: string, dto: PublicReviewDto) {
    const appointment = await this.findByManageToken(token);
    if (appointment.status !== AppointmentStatus.COMPLETED) {
      throw new BadRequestException('Avaliação disponível após o atendimento ser concluído');
    }
    if (appointment.review) {
      throw new ConflictException('Este atendimento já foi avaliado');
    }

    return this.prisma.review.create({
      data: {
        tenantId: appointment.tenantId,
        appointmentId: appointment.id,
        rating: dto.rating,
        comment: dto.comment?.slice(0, 500),
        clientName: appointment.client.name,
      },
      select: { id: true, rating: true, comment: true, createdAt: true },
    });
  }

  /** Notifica (até 5) clientes na lista de espera do dia em que abriu vaga. */
  private async notifyWaitlist(
    tenantId: string,
    slotDate: Date,
    tenant: Pick<Tenant, 'name' | 'slug' | 'timezone'>,
  ) {
    const dateKey = toDateKey(slotDate, tenant.timezone);
    const entries = await this.prisma.waitlistEntry.findMany({
      where: { tenantId, dateKey, status: WaitlistStatus.WAITING },
      orderBy: { createdAt: 'asc' },
      take: 5,
    });

    for (const entry of entries) {
      await this.notifications.enqueueWaitlistSlotOpen({
        tenantId,
        tenantName: tenant.name,
        tenantSlug: tenant.slug,
        dateKey,
        clientName: entry.clientName,
        clientPhone: entry.clientPhone,
        clientEmail: entry.clientEmail,
      });
      await this.prisma.waitlistEntry.update({
        where: { id: entry.id },
        data: { status: WaitlistStatus.NOTIFIED, notifiedAt: new Date() },
      });
    }
  }
}
