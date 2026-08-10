jest.mock('bullmq', () => {
  class Queue {
    constructor(..._args: unknown[]) {}
    add = jest.fn().mockResolvedValue({ id: 'q1' });
    close = jest.fn().mockResolvedValue(undefined);
    on = jest.fn();
  }
  class Worker {
    constructor(..._args: unknown[]) {}
    close = jest.fn().mockResolvedValue(undefined);
    on = jest.fn();
  }
  return { Queue, Worker };
});

import {
  NotificationChannel,
  NotificationJobStatus,
  NotificationJobType,
  PlanCode,
} from '@prisma/client';
import { NotificationsService } from './notifications.service';
import { hashToken, generateManageToken } from '../common/crypto/tokens';

/** Isola unit tests de Redis/BullMQ reais (mock no topo do arquivo). */
function buildService(prisma: unknown) {
  const env = {
    redisUrl: 'redis://127.0.0.1:6399',
    appPublicUrl: 'http://localhost:3000',
    runsBackgroundJobs: false,
    smtp: { host: '', port: 587, user: '', pass: '' },
    emailFrom: 'noreply@test.local',
  };
  const whatsapp = { sendText: jest.fn().mockResolvedValue(false) };
  const service = new NotificationsService(prisma as never, env as never, whatsapp as never);
  return { service, whatsapp };
}

describe('NotificationsService — enqueue orchestration', () => {
  it('cancelPendingForAppointment marca jobs PENDING e PROCESSING como FAILED', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 3 });
    const { service } = buildService({ notificationJob: { updateMany } });

    const count = await service.cancelPendingForAppointment('appt-1');
    expect(count).toBe(3);
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        appointmentId: 'appt-1',
        status: {
          in: [NotificationJobStatus.PENDING, NotificationJobStatus.PROCESSING],
        },
      },
      data: {
        status: NotificationJobStatus.FAILED,
        lastError: 'Invalidated: appointment rescheduled or cancelled',
        processedAt: expect.any(Date),
      },
    });
    await service.onModuleDestroy();
  });

  it('enqueueBookingConfirmation cria e-mail imediato + lembretes com raw manage token', async () => {
    const raw = generateManageToken();
    const startsAt = new Date(Date.now() + 3 * 86_400_000);
    const create = jest.fn().mockImplementation(async ({ data }) => ({
      id: `job-${data.type}-${data.channel}`,
      ...data,
    }));
    const findUnique = jest.fn().mockResolvedValue({
      id: 'appt-1',
      tenantId: 't1',
      startsAt,
      manageToken: hashToken(raw),
      client: { name: 'Ana', phone: '11999990000', email: 'ana@example.com' },
      service: { name: 'Corte' },
      tenant: {
        name: 'Barbearia',
        address: 'Rua 1',
        timezone: 'America/Sao_Paulo',
        plan: PlanCode.PRO,
        slug: 'barber',
      },
      professional: { name: 'Pro' },
    });

    const { service } = buildService({
      appointment: { findUnique },
      notificationJob: { create },
      tenant: { findUnique: jest.fn() },
    });

    const result = await service.enqueueBookingConfirmation('appt-1', raw);
    expect(result).toEqual({
      manageUrl: `http://localhost:3000/agendamento/${raw}`,
    });

    const types = create.mock.calls.map((c: [{ data: { type: string; channel: string } }]) => ({
      type: c[0].data.type,
      channel: c[0].data.channel,
    }));
    expect(types).toEqual(
      expect.arrayContaining([
        { type: NotificationJobType.BOOKING_CONFIRMATION, channel: NotificationChannel.EMAIL },
        { type: NotificationJobType.BOOKING_REMINDER, channel: NotificationChannel.EMAIL },
        { type: NotificationJobType.BOOKING_REMINDER, channel: NotificationChannel.WHATSAPP },
      ]),
    );
    // 1 confirmação + 2 lembretes e-mail (24h/2h) + 2 WhatsApp = 5
    expect(create).toHaveBeenCalledTimes(5);

    const confirmation = create.mock.calls.find(
      (c: [{ data: { type: string } }]) =>
        c[0].data.type === NotificationJobType.BOOKING_CONFIRMATION,
    )?.[0].data.payload as { subject: string; text: string };
    expect(confirmation.subject).toMatch(/^Corte confirmado · /);
    expect(confirmation.text).toContain(`/agendamento/${raw}`);
    expect(confirmation.text).toContain('seu agendamento de Corte');
    expect(confirmation.text).not.toMatch(/seu horário/i);

    const reminderEmails = create.mock.calls.filter(
      (c: [{ data: { type: string; channel: string } }]) =>
        c[0].data.type === NotificationJobType.BOOKING_REMINDER &&
        c[0].data.channel === NotificationChannel.EMAIL,
    );
    const reminderSubjects = reminderEmails.map(
      (c: [{ data: { payload: { subject: string } } }]) => c[0].data.payload.subject,
    );
    expect(reminderSubjects).toEqual(
      expect.arrayContaining(['Amanhã: Corte em Barbearia', 'Daqui a 2h: Corte te espera']),
    );
    for (const call of reminderEmails) {
      const text = (call[0].data.payload as { text: string }).text;
      expect(text).toContain('seu agendamento de Corte');
      expect(text).not.toMatch(/seu horário/i);
    }

    await service.onModuleDestroy();
  });

  it('enqueueBookingConfirmation sem e-mail e plano STARTER não cria lembrete WhatsApp', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'j1' });
    const findUnique = jest.fn().mockResolvedValue({
      id: 'appt-2',
      tenantId: 't1',
      startsAt: new Date(Date.now() + 3 * 86_400_000),
      manageToken: 'plaintext-legacy-token-xxxxxx',
      client: { name: 'Bob', phone: '1199', email: null },
      service: { name: 'Barba' },
      tenant: {
        name: 'Studio',
        address: null,
        timezone: 'America/Sao_Paulo',
        plan: PlanCode.STARTER,
        slug: 'studio',
      },
      professional: { name: 'Pro' },
    });

    const { service } = buildService({
      appointment: { findUnique },
      notificationJob: { create },
    });

    await service.enqueueBookingConfirmation('appt-2');
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].data.type).toBe(NotificationJobType.BOOKING_CONFIRMATION);
    await service.onModuleDestroy();
  });

  it('enqueueBookingCancelled cria e-mail com copy do profissional', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'j-c' });
    const findUnique = jest.fn().mockResolvedValue({
      id: 'appt-3',
      tenantId: 't1',
      startsAt: new Date(Date.now() + 86_400_000),
      manageToken: 'x',
      client: { name: 'Ana', phone: '1199', email: 'ana@example.com' },
      service: { name: 'Corte' },
      tenant: {
        name: 'Barbearia',
        timezone: 'America/Sao_Paulo',
        slug: 'barber',
        plan: PlanCode.PRO,
        address: null,
      },
      professional: { name: 'Pro' },
    });

    const { service } = buildService({
      appointment: { findUnique },
      notificationJob: { create },
    });

    await service.enqueueBookingCancelled('appt-3', 'professional');
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: NotificationJobType.BOOKING_CANCELLED,
        channel: NotificationChannel.EMAIL,
        payload: expect.objectContaining({
          to: 'ana@example.com',
          subject: 'Agendamento de Corte cancelado',
          text: expect.stringMatching(
            /foi cancelado por Barbearia[\s\S]*Próximo passo: escolha um novo horário/,
          ),
        }),
      }),
    });
    const cancelText = (create.mock.calls[0][0].data.payload as { text: string }).text;
    expect(cancelText).toContain('http://localhost:3000/u/barber');
    expect(cancelText).toMatch(/agendamento de Corte/);
    expect(cancelText).not.toMatch(/seu horário/i);
    await service.onModuleDestroy();
  });

  it('enqueuePasswordReset cria job PASSWORD_RESET', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'j-pr' });
    const { service } = buildService({ notificationJob: { create } });

    await service.enqueuePasswordReset(
      't1',
      'a@b.com',
      'João',
      'http://localhost:3000/redefinir?t=1',
    );
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: NotificationJobType.PASSWORD_RESET,
        channel: NotificationChannel.EMAIL,
        payload: expect.objectContaining({
          to: 'a@b.com',
          text: expect.stringContaining('http://localhost:3000/redefinir?t=1'),
        }),
      }),
    });
    await service.onModuleDestroy();
  });

  it('enqueueWaitlistSlotOpen cria WhatsApp (PRO) + e-mail', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'j-w' });
    const { service } = buildService({
      notificationJob: { create },
      tenant: { findUnique: jest.fn().mockResolvedValue({ plan: PlanCode.PRO }) },
    });

    await service.enqueueWaitlistSlotOpen({
      tenantId: 't1',
      tenantName: 'Barbearia',
      tenantSlug: 'barber',
      dateKey: '2026-08-20',
      clientName: 'Ana',
      clientPhone: '11999990000',
      clientEmail: 'ana@example.com',
    });

    const channels = create.mock.calls.map(
      (c: [{ data: { channel: string } }]) => c[0].data.channel,
    );
    expect(channels).toEqual(
      expect.arrayContaining([NotificationChannel.WHATSAPP, NotificationChannel.EMAIL]),
    );
    const emailPayload = create.mock.calls.find(
      (c: [{ data: { channel: string } }]) => c[0].data.channel === NotificationChannel.EMAIL,
    )?.[0].data.payload as { subject: string; text: string };
    expect(emailPayload.subject).toBe('Abriu vaga no dia que você pediu · Barbearia');
    expect(emailPayload.text).toContain('vaga para agendamento');
    expect(emailPayload.text).toContain('Próximo passo:');
    await service.onModuleDestroy();
  });

  it('enqueueBookingConfirmation no-op se appointment sumiu', async () => {
    const create = jest.fn();
    const { service } = buildService({
      appointment: { findUnique: jest.fn().mockResolvedValue(null) },
      notificationJob: { create },
    });
    await expect(service.enqueueBookingConfirmation('gone')).resolves.toBeUndefined();
    expect(create).not.toHaveBeenCalled();
    await service.onModuleDestroy();
  });
});

describe('NotificationsService.isBookingReminderStillValid', () => {
  function build(appt: { status: string; startsAt: Date } | null) {
    const prisma = {
      appointment: { findUnique: jest.fn().mockResolvedValue(appt) },
      notificationJob: { updateMany: jest.fn() },
    };
    const env = { redisUrl: 'redis://localhost:6379', appPublicUrl: 'http://localhost:3000' };
    const service = new NotificationsService(prisma as never, env as never, {} as never);
    return { service, prisma };
  }

  it('retorna false se appointment foi cancelado', async () => {
    const startsAt = new Date('2030-01-01T15:00:00.000Z');
    const { service } = build({ status: 'CANCELLED', startsAt });
    await expect(
      service.isBookingReminderStillValid('a1', { startsAtIso: startsAt.toISOString() }),
    ).resolves.toBe(false);
    await service.onModuleDestroy();
  });

  it('retorna false se startsAt do payload diverge (remarcação)', async () => {
    const oldStart = new Date('2030-01-01T15:00:00.000Z');
    const newStart = new Date('2030-01-02T15:00:00.000Z');
    const { service } = build({ status: 'SCHEDULED', startsAt: newStart });
    await expect(
      service.isBookingReminderStillValid('a1', { startsAtIso: oldStart.toISOString() }),
    ).resolves.toBe(false);
    await service.onModuleDestroy();
  });

  it('retorna true quando status ativo e startsAt bate', async () => {
    const startsAt = new Date('2030-01-01T15:00:00.000Z');
    const { service } = build({ status: 'SCHEDULED', startsAt });
    await expect(
      service.isBookingReminderStillValid('a1', { startsAtIso: startsAt.toISOString() }),
    ).resolves.toBe(true);
    await service.onModuleDestroy();
  });
});
