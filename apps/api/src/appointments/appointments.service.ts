import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AppointmentStatus,
  PixChargeStatus,
  Prisma,
  WaitlistStatus,
  type Tenant,
  type User,
} from '@prisma/client';
import {
  ACTIVE_APPOINTMENT_STATUSES,
  computeDaySlots,
  dateOnlyToDateKey,
  hasOverlap,
  startOfMonthInTimeZone,
  toDateKey,
} from '../common/availability/availability.engine';
import { PUBLIC_PROFILE_TTL_SECONDS, RedisCacheService } from '../common/cache/redis-cache.service';
import {
  DEFAULT_APPOINTMENTS_PAGE_SIZE,
  normalizePage,
  normalizePageSize,
  type PageResult,
} from '../common/pagination';
import { notifyNextWaitlistCandidate } from '../common/waitlist/notify-next';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MercadoPagoService } from '../payments/mercadopago.service';
import { EnvService } from '../config/env.service';
import { BookPublicDto, PublicReviewDto, RescheduleDto } from './dto/appointment.dto';
import { planAllowsPixDeposit } from '../billing/plan-entitlements';
import { assertValidTransition, isCancellableStatus } from './appointment-state';
import { LoyaltyService } from '../loyalty/loyalty.service';

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return '****';
  return `****${digits.slice(-4)}`;
}

function maskEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}***@${domain}`;
}

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

type AppointmentListItem = Prisma.AppointmentGetPayload<{ select: typeof APPOINTMENT_LIST_SELECT }>;

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly mercadoPago: MercadoPagoService,
    private readonly env: EnvService,
    private readonly loyalty: LoyaltyService,
    private readonly cache: RedisCacheService,
  ) {}

  /**
   * Lista paginada (default pageSize=100, max=100).
   * Breaking: resposta deixa de ser array cru → `{ items, total, page, pageSize }`.
   */
  async list(
    tenantId: string,
    opts: {
      from?: string;
      to?: string;
      professionalId?: string;
      page?: number;
      pageSize?: number;
    } = {},
  ): Promise<PageResult<AppointmentListItem>> {
    const page = normalizePage(opts.page);
    const pageSize = normalizePageSize(opts.pageSize, DEFAULT_APPOINTMENTS_PAGE_SIZE);
    const where: Prisma.AppointmentWhereInput = { tenantId };
    if (opts.professionalId) where.professionalId = opts.professionalId;
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
      },
    });
    if (!appt) throw new NotFoundException('Agendamento não encontrado');

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
      await this.notifications.enqueueBookingCancelled(id, 'professional');
      await notifyNextWaitlistCandidate(
        this.prisma,
        this.notifications,
        appt.tenantId,
        appt.startsAt,
        appt.tenant,
      );
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

  async getPublicProfile(slug: string) {
    const cacheKey = this.cache.publicProfileKey(slug);
    const cached =
      await this.cache.getJson<Awaited<ReturnType<AppointmentsService['loadPublicProfile']>>>(
        cacheKey,
      );
    if (cached) return cached;

    const profile = await this.loadPublicProfile(slug);
    await this.cache.setJson(cacheKey, profile, PUBLIC_PROFILE_TTL_SECONDS);
    return profile;
  }

  private async loadPublicProfile(slug: string) {
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

  /** Invalida cache do perfil público (settings/services/team/reviews). */
  async invalidatePublicProfileCache(tenantIdOrSlug: { tenantId?: string; slug?: string }) {
    if (tenantIdOrSlug.slug) {
      await this.cache.invalidatePublicProfile(tenantIdOrSlug.slug);
      return;
    }
    if (tenantIdOrSlug.tenantId) {
      await this.cache.invalidatePublicProfileByTenantId(tenantIdOrSlug.tenantId, async (id) => {
        const t = await this.prisma.tenant.findUnique({
          where: { id },
          select: { slug: true },
        });
        return t?.slug ?? null;
      });
    }
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
        // @db.Date: extrair civil UTC, não via timezone do tenant
        dateKey: dateOnlyToDateKey(e.date),
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

    const useOnlineDeposit =
      service.depositCents > 0 &&
      this.mercadoPago.isConfigured &&
      planAllowsPixDeposit(tenant.plan);

    try {
      const appointment = await this.prisma.$transaction(async (tx) => {
        // Lock advisory baseado no hash do professionalId (evita race entre requests)
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${professional.id}))`;

        // Limite mensal do plano no mês civil do timezone do tenant (M-04)
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
                ...(dto.marketingOptIn !== undefined ? { marketingOptIn: dto.marketingOptIn } : {}),
              },
            })
          : await tx.client.create({
              data: {
                tenantId: tenant.id,
                name: dto.clientName,
                phone: dto.clientPhone,
                email: dto.clientEmail,
                marketingOptIn: dto.marketingOptIn ?? false,
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
        id: appointment.id,
        startsAt: appointment.startsAt,
        endsAt: appointment.endsAt,
        status: appointment.status,
        priceCentsSnapshot: appointment.priceCentsSnapshot,
        durationMinutesSnapshot: appointment.durationMinutesSnapshot,
        customerNotes: appointment.customerNotes,
        client: {
          id: appointment.client.id,
          name: appointment.client.name,
          phone: maskPhone(appointment.client.phone),
          email: maskEmail(appointment.client.email),
        },
        service: {
          id: appointment.service.id,
          name: appointment.service.name,
          durationMinutes: appointment.service.durationMinutes,
          priceCents: appointment.service.priceCents,
        },
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
    if (amountCents <= 0) {
      throw new BadRequestException('Sinal inválido para cobrança PIX');
    }
    try {
      const charge = await this.mercadoPago.createPixCharge({
        amountCents,
        description: `Sinal — ${tenant.name}`,
        payerEmail: dto.clientEmail ?? null,
        payerName: dto.clientName,
        externalReference: appointmentId,
      });
      // Consistência appointment ↔ PixCharge: só persiste se ainda PENDING_PAYMENT
      const stillPending = await this.prisma.appointment.findFirst({
        where: { id: appointmentId, status: AppointmentStatus.PENDING_PAYMENT },
        select: { id: true },
      });
      if (!stillPending) {
        throw new BadRequestException('Agendamento não está mais aguardando pagamento');
      }
      await this.prisma.pixCharge.create({
        data: {
          tenantId: tenant.id,
          appointmentId,
          providerRef: charge.providerRef,
          amountCents,
          copyPaste: charge.copyPaste,
          qrCodeBase64: charge.qrCodeBase64,
          expiresAt: charge.expiresAt,
          status: PixChargeStatus.PENDING,
        },
      });
      return {
        copyPaste: charge.copyPaste,
        qrCodeBase64: charge.qrCodeBase64,
        ticketUrl: charge.ticketUrl,
        amountCents,
        expiresAt: charge.expiresAt?.toISOString() ?? null,
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        await this.prisma.appointment.updateMany({
          where: { id: appointmentId, status: AppointmentStatus.PENDING_PAYMENT },
          data: {
            status: AppointmentStatus.CANCELLED,
            cancelledAt: new Date(),
            cancelReason: 'Falha ao gerar cobrança PIX do sinal',
          },
        });
        throw error;
      }
      // Fail-closed: cancela PENDING_PAYMENT e libera o slot se o PSP falhou
      await this.prisma.appointment.updateMany({
        where: { id: appointmentId, status: AppointmentStatus.PENDING_PAYMENT },
        data: {
          status: AppointmentStatus.CANCELLED,
          cancelledAt: new Date(),
          cancelReason: 'Falha ao gerar cobrança PIX do sinal',
        },
      });
      throw new BadRequestException(
        'Não foi possível gerar o PIX do sinal. Tente novamente em instantes.',
      );
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
    // Resposta mínima: sem manageToken no body e PII mascarada (link já autentica o cliente)
    return {
      id: appointment.id,
      startsAt: appointment.startsAt,
      endsAt: appointment.endsAt,
      status: appointment.status,
      priceCentsSnapshot: appointment.priceCentsSnapshot,
      durationMinutesSnapshot: appointment.durationMinutesSnapshot,
      client: {
        name: appointment.client.name,
        phone: maskPhone(appointment.client.phone),
        email: maskEmail(appointment.client.email),
      },
      service: appointment.service,
      professional: appointment.professional,
      tenant: appointment.tenant,
      pixCharge: appointment.pixCharge,
      review: appointment.review,
      canCancel: isCancellableStatus(appointment.status) && new Date() < canCancelUntil,
      canCancelUntil: canCancelUntil.toISOString(),
      canReview: appointment.status === AppointmentStatus.COMPLETED && appointment.review === null,
    };
  }

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

  async cancelByToken(token: string, reason?: string) {
    const appointment = await this.findByManageToken(token);
    if (!isCancellableStatus(appointment.status)) {
      throw new BadRequestException('Este agendamento não pode mais ser cancelado');
    }
    assertValidTransition(appointment.status, AppointmentStatus.CANCELLED);

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
      await notifyNextWaitlistCandidate(
        this.prisma,
        this.notifications,
        appointment.tenantId,
        appointment.startsAt,
        tenant,
      );
    }

    return { ok: true };
  }

  async rescheduleByToken(token: string, dto: RescheduleDto) {
    const appointment = await this.findByManageToken(token);
    if (!isCancellableStatus(appointment.status)) {
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

    const nextStatus =
      appointment.status === AppointmentStatus.PENDING_PAYMENT
        ? AppointmentStatus.PENDING_PAYMENT
        : AppointmentStatus.SCHEDULED;
    assertValidTransition(appointment.status, nextStatus);

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
            status: nextStatus,
          },
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Horário acabou de ser reservado');
      }
      throw error;
    }

    // Horário antigo abriu: avisa o próximo da lista de espera e reenvia confirmação
    await notifyNextWaitlistCandidate(
      this.prisma,
      this.notifications,
      appointment.tenantId,
      appointment.startsAt,
      tenant,
    );
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

    const created = await this.prisma.review.create({
      data: {
        tenantId: appointment.tenantId,
        appointmentId: appointment.id,
        rating: dto.rating,
        comment: dto.comment?.slice(0, 500),
        clientName: appointment.client.name,
      },
      select: { id: true, rating: true, comment: true, createdAt: true },
    });
    await this.cache.invalidatePublicProfile(appointment.tenant.slug);
    return created;
  }
}
