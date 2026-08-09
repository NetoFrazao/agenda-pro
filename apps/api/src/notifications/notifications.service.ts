import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { NotificationChannel, NotificationJobStatus, NotificationJobType } from '@prisma/client';
import { Queue, Worker, type Job } from 'bullmq';
import * as nodemailer from 'nodemailer';
import { EnvService } from '../config/env.service';
import { PrismaService } from '../prisma/prisma.service';

const QUEUE_NAME = 'notifications';

type NotificationJobPayload = {
  notificationJobId: string;
};

@Injectable()
export class NotificationsService implements OnModuleDestroy {
  private readonly logger = new Logger(NotificationsService.name);
  private queue: Queue<NotificationJobPayload> | null = null;
  private worker: Worker<NotificationJobPayload> | null = null;
  private readonly connection: { url: string };

  constructor(
    private readonly prisma: PrismaService,
    private readonly env: EnvService,
  ) {
    this.connection = { url: this.env.redisUrl };
    this.bootstrapQueue();
  }

  private bootstrapQueue() {
    try {
      this.queue = new Queue(QUEUE_NAME, { connection: this.connection });
      this.worker = new Worker(QUEUE_NAME, async (job) => this.processJob(job), {
        connection: this.connection,
      });
      this.worker.on('failed', (job, err) => {
        this.logger.error(`Job ${job?.id} failed: ${err.message}`);
      });
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

  async enqueueBookingConfirmation(appointmentId: string) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        client: true,
        service: true,
        tenant: true,
        professional: true,
      },
    });
    if (!appointment) return;

    const emailJob = await this.prisma.notificationJob.create({
      data: {
        tenantId: appointment.tenantId,
        appointmentId: appointment.id,
        type: NotificationJobType.BOOKING_CONFIRMATION,
        channel: NotificationChannel.EMAIL,
        payload: {
          to: appointment.client.email,
          subject: `Agendamento confirmado — ${appointment.tenant.name}`,
          appointmentId: appointment.id,
        },
        status: NotificationJobStatus.PENDING,
      },
    });

    // Link wa.me pré-preenchido (diferencial MVP sem WhatsApp Business API)
    const phoneDigits = appointment.client.phone.replace(/\D/g, '');
    const when = appointment.startsAt.toLocaleString('pt-BR', {
      timeZone: appointment.tenant.timezone,
    });
    const text = encodeURIComponent(
      `Olá ${appointment.client.name}! Lembrete do seu horário em ${appointment.tenant.name}: ${appointment.service.name} em ${when}.`,
    );
    const waLink = `https://wa.me/${phoneDigits}?text=${text}`;

    const waJob = await this.prisma.notificationJob.create({
      data: {
        tenantId: appointment.tenantId,
        appointmentId: appointment.id,
        type: NotificationJobType.WHATSAPP_REMINDER_LINK,
        channel: NotificationChannel.WHATSAPP,
        payload: {
          waLink,
          phone: appointment.client.phone,
          appointmentId: appointment.id,
        },
        status: NotificationJobStatus.PENDING,
        scheduledFor: new Date(appointment.startsAt.getTime() - 24 * 3600_000),
      },
    });

    await this.enqueue(emailJob.id);
    await this.enqueue(waJob.id);

    return { emailJobId: emailJob.id, waJobId: waJob.id, waLink };
  }

  private async enqueue(notificationJobId: string) {
    if (!this.queue) return;
    try {
      await this.queue.add(
        'notify',
        { notificationJobId },
        {
          removeOnComplete: 100,
          removeOnFail: 50,
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
        },
      );
    } catch (error) {
      this.logger.warn(`Falha ao enfileirar ${notificationJobId}: ${(error as Error).message}`);
    }
  }

  private async processJob(job: Job<NotificationJobPayload>) {
    const record = await this.prisma.notificationJob.findUnique({
      where: { id: job.data.notificationJobId },
    });
    if (!record || record.status === NotificationJobStatus.COMPLETED) return;

    await this.prisma.notificationJob.update({
      where: { id: record.id },
      data: { status: NotificationJobStatus.PROCESSING, attempts: { increment: 1 } },
    });

    try {
      if (record.channel === NotificationChannel.EMAIL) {
        await this.sendEmail(record.payload as Record<string, unknown>);
      } else if (record.channel === NotificationChannel.WHATSAPP) {
        // MVP: não dispara API externa — marca como pronto; o link fica no payload para o dashboard
        this.logger.log(
          `WhatsApp reminder pronto: ${(record.payload as { waLink?: string }).waLink}`,
        );
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
      text: `Seu agendamento foi registrado. ID: ${payload.appointmentId}`,
    });
  }
}
