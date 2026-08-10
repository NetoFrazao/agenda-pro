import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AppointmentStatus, Prisma } from '@prisma/client';
import {
  ACTIVE_APPOINTMENT_STATUSES,
  hasOverlap,
  toDateKey,
} from '../common/availability/availability.engine';
import { PrismaService } from '../prisma/prisma.service';
import { PublicReviewDto, RescheduleDto } from './dto/appointment.dto';
import { hashToken } from '../common/crypto/tokens';
import { assertValidTransition, isCancellableStatus } from './appointment-state';
import { AppointmentAvailabilityService } from './appointment-availability.service';
import { AppointmentSideEffectsService } from './appointment-side-effects.service';
import { maskEmail, maskPhone } from './appointment-masks';

@Injectable()
export class ManageAppointmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly availability: AppointmentAvailabilityService,
    private readonly sideEffects: AppointmentSideEffectsService,
  ) {}

  /**
   * Resolve manage link: hash(raw) primeiro; dual-read plaintext para tokens legados (cuid/md5).
   */
  async findByManageToken(token: string) {
    const include = {
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
    } satisfies Prisma.AppointmentInclude;

    const byHash = await this.prisma.appointment.findUnique({
      where: { manageToken: hashToken(token) },
      include,
    });
    if (byHash) return byHash;

    // Legado: token armazenado em claro (cuid / md5 pré-hash)
    const legacy = await this.prisma.appointment.findUnique({
      where: { manageToken: token },
      include,
    });
    if (!legacy) throw new NotFoundException('Agendamento não encontrado');
    return legacy;
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
    // Sinal PIX: só PixLifecycleService.confirmPaid promove PENDING_PAYMENT → CONFIRMED
    if (appointment.status === AppointmentStatus.PENDING_PAYMENT) {
      throw new BadRequestException(
        'Confirmação disponível após o pagamento do sinal PIX. Conclua o pagamento ou aguarde a confirmação automática.',
      );
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

    await this.sideEffects.onCancelled({
      appointmentId: appointment.id,
      tenantId: appointment.tenantId,
      startsAt: appointment.startsAt,
      cancelledBy: 'client',
      slug: appointment.tenant.slug,
    });

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

    const professional = await this.availability.resolveProfessional(
      tenant.id,
      appointment.professional.id,
    );
    const newStartsAt = new Date(dto.startsAt);
    if (Number.isNaN(newStartsAt.getTime())) {
      throw new BadRequestException('startsAt inválido');
    }
    this.availability.assertWithinBookingWindow(newStartsAt, tenant);
    const newEndsAt = new Date(
      newStartsAt.getTime() + appointment.durationMinutesSnapshot * 60_000,
    );
    const dateKey = toDateKey(newStartsAt, tenant.timezone);

    const validSlots = await this.availability.computeSlotsFor(
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

    // Horário antigo abriu: invalida lembretes do slot antigo, avisa waitlist e reenvia confirmação
    await this.sideEffects.onRescheduled({
      appointmentId: appointment.id,
      tenantId: appointment.tenantId,
      previousStartsAt: appointment.startsAt,
      manageTokenRaw: token,
      tenant,
    });

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
    await this.sideEffects.invalidateProfile(appointment.tenant.slug);
    return created;
  }
}
