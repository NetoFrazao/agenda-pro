import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import {
  NotificationChannel,
  NotificationJobStatus,
  NotificationJobType,
  Prisma,
} from '@prisma/client';
import { Queue, Worker, type Job } from 'bullmq';
import * as nodemailer from 'nodemailer';
import { EnvService } from '../config/env.service';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppProvider } from './whatsapp.provider';
import { planAllowsWhatsappReminders } from '../billing/plan-entitlements';
import { isTokenHash } from '../common/crypto/tokens';

const QUEUE_NAME = 'notifications';

type NotificationJobPayload = {
  notificationJobId: string;
};

type AppointmentWithRelations = Prisma.AppointmentGetPayload<{
  include: { client: true; service: true; tenant: true; professional: true };
}>;

@Injectable()
export class NotificationsService implements OnModuleDestroy {
  private readonly logger = new Logger(NotificationsService.name);
  private queue: Queue<NotificationJobPayload> | null = null;
  private worker: Worker<NotificationJobPayload> | null = null;
  private readonly connection: { url: string };

  constructor(
    private readonly prisma: PrismaService,
    private readonly env: EnvService,
    private readonly whatsapp: WhatsAppProvider,
  ) {
    this.connection = { url: this.env.redisUrl };
    this.bootstrapQueue();
  }

  private bootstrapQueue() {
    try {
      this.queue = new Queue(QUEUE_NAME, { connection: this.connection });
      // Worker só no processo background (`PROCESS_ROLE=worker|all`). API só enfileira.
      if (this.env.runsBackgroundJobs) {
        this.worker = new Worker(QUEUE_NAME, async (job) => this.processJob(job), {
          connection: this.connection,
        });
        this.worker.on('failed', (job, err) => {
          this.logger.error(`Job ${job?.id} failed: ${err.message}`);
        });
      } else {
        this.logger.log(
          'BullMQ Worker desligado neste processo (PROCESS_ROLE=api). Rode o worker.',
        );
      }
    } catch (error) {
      this.logger.warn(
        `Fila BullMQ indisponível (${(error as Error).message}). Jobs ficam só no banco.`,
      );
    }
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
  }

  private manageUrl(manageToken: string): string {
    return `${this.env.appPublicUrl}/agendamento/${manageToken}`;
  }

  /**
   * Raw na URL quando disponível; legado plaintext no DB ainda monta o link;
   * hash-only sem raw → null (e-mail pede para usar o link já recebido).
   */
  private resolveManageUrl(storedManageToken: string, rawManageToken?: string): string | null {
    if (rawManageToken) return this.manageUrl(rawManageToken);
    if (!isTokenHash(storedManageToken)) return this.manageUrl(storedManageToken);
    return null;
  }

  private formatWhen(appointment: AppointmentWithRelations): string {
    return appointment.startsAt.toLocaleString('pt-BR', {
      timeZone: appointment.tenant.timezone,
      dateStyle: 'short',
      timeStyle: 'short',
    });
  }

  /**
   * Confirmação imediata (e-mail) + lembretes com delay real na fila:
   * 24h e 2h antes do horário, por e-mail e WhatsApp.
   */
  /**
   * @param rawManageToken token em claro (só na URL). Obrigatório para incluir manage link
   * quando `appointments.manageToken` já é hash SHA-256. Legado plaintext ainda funciona sem ele.
   */
  async enqueueBookingConfirmation(appointmentId: string, rawManageToken?: string) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: { client: true, service: true, tenant: true, professional: true },
    });
    if (!appointment) return;

    const when = this.formatWhen(appointment);
    const manageUrl = this.resolveManageUrl(appointment.manageToken, rawManageToken);
    const location = `${appointment.tenant.name}${
      appointment.tenant.address ? ` — ${appointment.tenant.address}` : ''
    }`;
    const manageLines = manageUrl
      ? ['', 'Precisa confirmar presença, remarcar ou cancelar? Use seu link exclusivo:', manageUrl]
      : ['', 'Precisa remarcar ou cancelar? Use o link exclusivo que você recebeu ao agendar.'];

    await this.createAndEnqueue({
      tenantId: appointment.tenantId,
      appointmentId: appointment.id,
      type: NotificationJobType.BOOKING_CONFIRMATION,
      channel: NotificationChannel.EMAIL,
      payload: {
        to: appointment.client.email,
        subject: `${appointment.service.name} confirmado · ${when}`,
        text: [
          `Olá ${appointment.client.name}!`,
          '',
          `Que bom te receber — seu agendamento de ${appointment.service.name} está confirmado para ${when}.`,
          `Local: ${location}`,
          ...manageLines,
          '',
          `Até lá! Equipe ${appointment.tenant.name}`,
        ].join('\n'),
        appointmentId: appointment.id,
      },
    });

    // Lembretes: 24h e 2h antes (somente se ainda houver tempo hábil)
    for (const hoursBefore of [24, 2]) {
      const scheduledFor = new Date(appointment.startsAt.getTime() - hoursBefore * 3_600_000);
      const delayMs = scheduledFor.getTime() - Date.now();
      if (delayMs <= 0) continue;

      const timingLabel = hoursBefore === 24 ? 'amanhã' : 'daqui a 2 horas';
      const manageCta = manageUrl
        ? `Confirme presença ou remarque neste link: ${manageUrl}`
        : `Use o link exclusivo que você recebeu ao agendar para confirmar presença ou remarcar.`;
      const reminderText = [
        `Olá ${appointment.client.name}!`,
        '',
        `Passando para lembrar: seu agendamento de ${appointment.service.name} em ${appointment.tenant.name} é ${timingLabel} (${when}).`,
        `Estamos te esperando.`,
        '',
        manageCta,
      ].join('\n');

      if (planAllowsWhatsappReminders(appointment.tenant.plan)) {
        await this.createAndEnqueue(
          {
            tenantId: appointment.tenantId,
            appointmentId: appointment.id,
            type: NotificationJobType.BOOKING_REMINDER,
            channel: NotificationChannel.WHATSAPP,
            scheduledFor,
            payload: {
              phone: appointment.client.phone,
              message: reminderText,
              waLink: this.buildWaLink(appointment.client.phone, reminderText),
              appointmentId: appointment.id,
              startsAtIso: appointment.startsAt.toISOString(),
            },
          },
          delayMs,
        );
      }

      if (appointment.client.email) {
        await this.createAndEnqueue(
          {
            tenantId: appointment.tenantId,
            appointmentId: appointment.id,
            type: NotificationJobType.BOOKING_REMINDER,
            channel: NotificationChannel.EMAIL,
            scheduledFor,
            payload: {
              to: appointment.client.email,
              subject:
                hoursBefore === 24
                  ? `Amanhã: ${appointment.service.name} em ${appointment.tenant.name}`
                  : `Daqui a 2h: ${appointment.service.name} te espera`,
              text: reminderText,
              appointmentId: appointment.id,
              startsAtIso: appointment.startsAt.toISOString(),
            },
          },
          delayMs,
        );
      }
    }

    return { manageUrl };
  }

  async enqueueBookingCancelled(appointmentId: string, cancelledBy: 'client' | 'professional') {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: { client: true, service: true, tenant: true, professional: true },
    });
    if (!appointment) return;

    const when = this.formatWhen(appointment);
    const bookingUrl = `${this.env.appPublicUrl}/u/${appointment.tenant.slug}`;

    if (appointment.client.email) {
      const intro =
        cancelledBy === 'professional'
          ? `Seu agendamento de ${appointment.service.name} em ${when} foi cancelado por ${appointment.tenant.name}.`
          : `Confirmamos o cancelamento do seu agendamento de ${appointment.service.name} em ${when}.`;

      await this.createAndEnqueue({
        tenantId: appointment.tenantId,
        appointmentId: appointment.id,
        type: NotificationJobType.BOOKING_CANCELLED,
        channel: NotificationChannel.EMAIL,
        payload: {
          to: appointment.client.email,
          subject: `Agendamento de ${appointment.service.name} cancelado`,
          text: [
            `Olá ${appointment.client.name},`,
            '',
            intro,
            '',
            'Próximo passo: escolha um novo horário quando quiser em:',
            bookingUrl,
            '',
            `Se precisar de ajuda, fale com ${appointment.tenant.name}.`,
          ].join('\n'),
          appointmentId: appointment.id,
        },
      });
    }
  }

  async enqueuePasswordReset(tenantId: string, email: string, name: string, resetUrl: string) {
    await this.createAndEnqueue({
      tenantId,
      type: NotificationJobType.PASSWORD_RESET,
      channel: NotificationChannel.EMAIL,
      payload: {
        to: email,
        subject: 'Redefinição de senha — Agenda Pro',
        text: [
          `Olá ${name},`,
          '',
          'Recebemos um pedido para redefinir a sua senha. O link vale por 1 hora:',
          resetUrl,
          '',
          'Se você não pediu isso, ignore este e-mail — sua senha continua a mesma.',
        ].join('\n'),
      },
    });
  }

  async enqueueWaitlistSlotOpen(input: {
    tenantId: string;
    tenantName: string;
    tenantSlug: string;
    dateKey: string;
    clientName: string;
    clientPhone: string;
    clientEmail: string | null;
  }) {
    const bookingUrl = `${this.env.appPublicUrl}/u/${input.tenantSlug}`;
    const message = [
      `Olá ${input.clientName}!`,
      '',
      `Boa notícia: abriu uma vaga para agendamento em ${input.tenantName} no dia que você queria (${input.dateKey}).`,
      '',
      `Próximo passo: garanta o seu agora em:`,
      bookingUrl,
    ].join('\n');

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: input.tenantId },
      select: { plan: true },
    });
    if (tenant && planAllowsWhatsappReminders(tenant.plan)) {
      await this.createAndEnqueue({
        tenantId: input.tenantId,
        type: NotificationJobType.WAITLIST_SLOT_OPEN,
        channel: NotificationChannel.WHATSAPP,
        payload: {
          phone: input.clientPhone,
          message,
          waLink: this.buildWaLink(input.clientPhone, message),
        },
      });
    }

    if (input.clientEmail) {
      await this.createAndEnqueue({
        tenantId: input.tenantId,
        type: NotificationJobType.WAITLIST_SLOT_OPEN,
        channel: NotificationChannel.EMAIL,
        payload: {
          to: input.clientEmail,
          subject: `Abriu vaga no dia que você pediu · ${input.tenantName}`,
          text: message,
        },
      });
    }
  }

  private buildWaLink(phone: string, text: string): string {
    const digits = phone.replace(/\D/g, '');
    const number = digits.startsWith('55') ? digits : `55${digits}`;
    return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
  }

  /**
   * Invalida jobs ainda não enviados do agendamento (PENDING + PROCESSING).
   * O worker revalida no momento do envio — cobre a race em que o job já foi claimado.
   */
  async cancelPendingForAppointment(appointmentId: string): Promise<number> {
    const result = await this.prisma.notificationJob.updateMany({
      where: {
        appointmentId,
        status: {
          in: [NotificationJobStatus.PENDING, NotificationJobStatus.PROCESSING],
        },
      },
      data: {
        status: NotificationJobStatus.FAILED,
        lastError: 'Invalidated: appointment rescheduled or cancelled',
        processedAt: new Date(),
      },
    });
    return result.count;
  }

  /**
   * Verificação no momento do envio: status do appointment + startsAt do payload.
   * Retorna false se o lembrete não deve mais sair (cancelado/remarcado).
   */
  async isBookingReminderStillValid(
    appointmentId: string,
    payload: Record<string, unknown>,
  ): Promise<boolean> {
    const appt = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      select: { status: true, startsAt: true },
    });
    if (!appt) return false;
    if (appt.status === 'CANCELLED' || appt.status === 'NO_SHOW') return false;

    const startsAtIso = payload.startsAtIso;
    if (typeof startsAtIso === 'string' && startsAtIso.length > 0) {
      const expected = new Date(startsAtIso).getTime();
      if (Number.isFinite(expected) && expected !== appt.startsAt.getTime()) {
        return false;
      }
    }
    return true;
  }

  private async createAndEnqueue(
    data: {
      tenantId: string;
      appointmentId?: string;
      type: NotificationJobType;
      channel: NotificationChannel;
      payload: Record<string, unknown>;
      scheduledFor?: Date;
    },
    delayMs = 0,
  ) {
    const record = await this.prisma.notificationJob.create({
      data: {
        tenantId: data.tenantId,
        appointmentId: data.appointmentId,
        type: data.type,
        channel: data.channel,
        payload: data.payload as Prisma.InputJsonValue,
        status: NotificationJobStatus.PENDING,
        scheduledFor: data.scheduledFor ?? new Date(),
      },
    });

    if (!this.queue) return record;
    try {
      await this.queue.add(
        'notify',
        { notificationJobId: record.id },
        {
          delay: Math.max(0, delayMs),
          removeOnComplete: 100,
          removeOnFail: 50,
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
        },
      );
    } catch (error) {
      this.logger.warn(`Falha ao enfileirar ${record.id}: ${(error as Error).message}`);
    }
    return record;
  }

  private async processJob(job: Job<NotificationJobPayload>) {
    const record = await this.prisma.notificationJob.findUnique({
      where: { id: job.data.notificationJobId },
    });
    if (!record || record.status === NotificationJobStatus.COMPLETED) return;
    if (record.status === NotificationJobStatus.FAILED) return;

    // Pré-check (antes de claim): cancelado / remarcado
    if (record.appointmentId && record.type === NotificationJobType.BOOKING_REMINDER) {
      const stillValid = await this.isBookingReminderStillValid(
        record.appointmentId,
        record.payload as Record<string, unknown>,
      );
      if (!stillValid) {
        await this.prisma.notificationJob.update({
          where: { id: record.id },
          data: {
            status: NotificationJobStatus.FAILED,
            lastError: 'Invalidated at send-time: appointment cancelled or rescheduled',
            processedAt: new Date(),
          },
        });
        return;
      }
    }

    await this.prisma.notificationJob.update({
      where: { id: record.id },
      data: { status: NotificationJobStatus.PROCESSING, attempts: { increment: 1 } },
    });

    try {
      // Revalidação no momento do envio (race: cancel/reschedule após claim)
      const latest = await this.prisma.notificationJob.findUnique({
        where: { id: record.id },
      });
      if (!latest || latest.status === NotificationJobStatus.FAILED) {
        return;
      }

      const payload = latest.payload as Record<string, unknown>;
      if (latest.appointmentId && latest.type === NotificationJobType.BOOKING_REMINDER) {
        const stillValid = await this.isBookingReminderStillValid(latest.appointmentId, payload);
        if (!stillValid) {
          await this.prisma.notificationJob.update({
            where: { id: latest.id },
            data: {
              status: NotificationJobStatus.FAILED,
              lastError: 'Invalidated at send-time: appointment cancelled or rescheduled',
              processedAt: new Date(),
            },
          });
          return;
        }
      }

      if (latest.channel === NotificationChannel.EMAIL) {
        await this.sendEmail(payload);
      } else if (latest.channel === NotificationChannel.WHATSAPP) {
        const sent = await this.whatsapp.sendText(
          String(payload.phone ?? ''),
          String(payload.message ?? ''),
        );
        if (!sent) {
          // Modo link: o wa.me fica no payload para disparo manual pelo dashboard
          this.logger.log(`WhatsApp em modo link: ${payload.waLink}`);
        }
      }

      await this.prisma.notificationJob.update({
        where: { id: record.id },
        data: { status: NotificationJobStatus.COMPLETED, processedAt: new Date() },
      });
    } catch (error) {
      await this.prisma.notificationJob.update({
        where: { id: record.id },
        data: {
          status: NotificationJobStatus.FAILED,
          lastError: (error as Error).message,
        },
      });
      throw error;
    }
  }

  private async sendEmail(payload: Record<string, unknown>) {
    const to = payload.to as string | null | undefined;
    if (!to) {
      this.logger.warn('E-mail sem destinatário — pulando envio');
      return;
    }

    const smtp = this.env.smtp;
    if (!smtp.host) {
      this.logger.log(`[dev] E-mail simulado para ${to}: ${payload.subject}`);
      return;
    }

    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
    });

    await transporter.sendMail({
      from: this.env.emailFrom,
      to,
      subject: String(payload.subject ?? 'Agendamento'),
      text: String(payload.text ?? ''),
    });
  }
}
