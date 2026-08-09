import { NotificationJobStatus } from '@prisma/client';
import { NotificationsService } from './notifications.service';

describe('NotificationsService.cancelPendingForAppointment', () => {
  it('marca jobs PENDING do appointment como FAILED', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 3 });
    const prisma = { notificationJob: { updateMany } };
    const env = { redisUrl: 'redis://localhost:6379', appPublicUrl: 'http://localhost:3000' };

    const service = new NotificationsService(prisma as never, env as never, {} as never);

    // Avoid BullMQ side-effects from constructor bootstrap if any leaked — method only uses prisma
    const count = await service.cancelPendingForAppointment('appt-1');

    expect(count).toBe(3);
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        appointmentId: 'appt-1',
        status: NotificationJobStatus.PENDING,
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
