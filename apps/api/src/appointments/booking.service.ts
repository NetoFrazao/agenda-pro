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
} from '@prisma/client';
import {
  ACTIVE_APPOINTMENT_STATUSES,
  hasOverlap,
  startOfMonthInTimeZone,
  toDateKey,
} from '../common/availability/availability.engine';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MercadoPagoService } from '../payments/mercadopago.service';
import { EnvService } from '../config/env.service';
import { BookPublicDto } from './dto/appointment.dto';
import {
  planAllowsPixDeposit,
  subscriptionAllowsPublicBooking,
} from '../billing/plan-entitlements';
import { generateManageToken, hashToken } from '../common/crypto/tokens';
import { AppointmentAvailabilityService } from './appointment-availability.service';
import { AppointmentSideEffectsService } from './appointment-side-effects.service';
import { maskEmail, maskPhone } from './appointment-masks';

/**
 * Booking público + ciclo de cobrança do sinal PIX (Mercado Pago).
 */
@Injectable()
export class BookingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly mercadoPago: MercadoPagoService,
    private readonly env: EnvService,
    private readonly availability: AppointmentAvailabilityService,
    private readonly sideEffects: AppointmentSideEffectsService,
  ) {}

  /**
   * Booking público com prevenção de double-booking:
   * 1) advisory lock por profissional
   * 2) revalida overlap dentro da transaction (com buffer)
   * 3) unique parcial (professionalId, startsAt) ativos como rede de segurança
   * Também aplica o limite mensal do plano e cria a cobrança PIX do sinal.
   */
  async bookPublic(slug: string, dto: BookPublicDto) {
    const tenant = await this.prisma.tenant.findFirst({
      where: { slug, deletedAt: null },
      include: { subscription: true },
    });
    if (!tenant) throw new NotFoundException('Profissional não encontrado');

    if (!subscriptionAllowsPublicBooking(tenant.subscription?.status)) {
      throw new ConflictException(
        'Este profissional está temporariamente sem agenda online. Tente novamente mais tarde.',
      );
    }

    const service = await this.prisma.service.findFirst({
      where: { id: dto.serviceId, tenantId: tenant.id, isActive: true, deletedAt: null },
    });
    if (!service) throw new NotFoundException('Serviço não encontrado');

    const professional = await this.availability.resolveProfessional(tenant.id, dto.professionalId);

    const startsAt = new Date(dto.startsAt);
    if (Number.isNaN(startsAt.getTime())) {
      throw new BadRequestException('startsAt inválido');
    }
    this.availability.assertWithinBookingWindow(startsAt, tenant);

    const endsAt = new Date(startsAt.getTime() + service.durationMinutes * 60_000);
    const dateKey = toDateKey(startsAt, tenant.timezone);

    // Valida que o horário ainda é um slot válido (regras + grade + buffer)
    const validSlots = await this.availability.computeSlotsFor(
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
      const booked = await this.prisma.$transaction(async (tx) => {
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

        const rawManageToken = generateManageToken();
        const appointment = await tx.appointment.create({
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
            manageToken: hashToken(rawManageToken),
            customerNotes: dto.notes,
            priceCentsSnapshot: service.priceCents,
            durationMinutesSnapshot: service.durationMinutes,
          },
          include: { client: true, service: true },
        });
        return { appointment, rawManageToken };
      });

      const { appointment, rawManageToken } = booked;

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
        await this.notifications.enqueueBookingConfirmation(appointment.id, rawManageToken);
      }

      await this.sideEffects.invalidateSlots(slug);

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
        manageUrl: `${this.env.appPublicUrl}/agendamento/${rawManageToken}`,
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

  /** Ciclo de pagamento do sinal: cria PixCharge ou cancela o slot (fail-closed). */
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
}
