import { NotificationJobStatus } from '@prisma/client';
import { NotificationsService } from './notifications.service';

describe('NotificationsService.cancelPendingForAppointment', () => {
  it('marca jobs PENDING e PROCESSING do appointment como FAILED', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 3 });
    const prisma = { notificationJob: { updateMany } };
    const env = { redisUrl: 'redis://localhost:6379', appPublicUrl: 'http://localhost:3000' };

    const service = new NotificationsService(prisma as never, env as never, {} as never);

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
