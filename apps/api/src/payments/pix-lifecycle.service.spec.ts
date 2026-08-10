import { AppointmentStatus, PixChargeStatus } from '@prisma/client';
import { PixLifecycleService } from './pix-lifecycle.service';

function mockCache(lockResult: 'acquired' | 'busy' | 'unavailable' = 'acquired') {
  return {
    tryAcquireLock: jest.fn().mockResolvedValue(lockResult),
  };
}

describe('PixLifecycleService — C-02 release PENDING_PAYMENT', () => {
  it('cancela appointment PENDING_PAYMENT e expira a charge', async () => {
    const appt = {
      id: 'appt-1',
      tenantId: 't1',
      status: AppointmentStatus.PENDING_PAYMENT,
      startsAt: new Date('2026-08-10T15:00:00.000Z'),
      tenant: { id: 't1', name: 'Demo', slug: 'demo', timezone: 'America/Sao_Paulo' },
      pixCharge: { id: 'ch-1', status: PixChargeStatus.PENDING },
    };

    const pixChargeUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const appointmentUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      appointment: {
        findUnique: jest.fn().mockResolvedValue(appt),
        findMany: jest.fn().mockResolvedValue([]),
      },
      pixCharge: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
        return fn({
          pixCharge: { updateMany: pixChargeUpdateMany },
          appointment: { updateMany: appointmentUpdateMany },
          waitlistEntry: {
            findFirst: jest.fn().mockResolvedValue(null),
            updateMany: jest.fn(),
          },
        });
      }),
    };
    const notifications = { enqueueWaitlistSlotOpen: jest.fn() };

    const service = new PixLifecycleService(
      prisma as never,
      notifications as never,
      {
        runsBackgroundJobs: true,
      } as never,
      mockCache() as never,
    );
    const released = await service.releasePendingPayment('appt-1', 'PIX expirado');

    expect(released).toBe(true);
    expect(pixChargeUpdateMany).toHaveBeenCalledWith({
      where: { id: 'ch-1', status: PixChargeStatus.PENDING },
      data: { status: PixChargeStatus.EXPIRED },
    });
    expect(appointmentUpdateMany).toHaveBeenCalledWith({
      where: { id: 'appt-1', status: { in: [AppointmentStatus.PENDING_PAYMENT] } },
      data: expect.objectContaining({ status: AppointmentStatus.CANCELLED }),
    });
    expect(notifications.enqueueWaitlistSlotOpen).not.toHaveBeenCalled();
  });

  it('não altera appointment já confirmado com charge PAID', async () => {
    const prisma = {
      appointment: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'appt-1',
          status: AppointmentStatus.CONFIRMED,
          pixCharge: { id: 'ch-1', status: PixChargeStatus.PAID },
          tenant: { timezone: 'America/Sao_Paulo', name: 'X', slug: 'x' },
        }),
      },
      $transaction: jest.fn(),
    };
    const service = new PixLifecycleService(
      prisma as never,
      {
        enqueueWaitlistSlotOpen: jest.fn(),
      } as never,
      { runsBackgroundJobs: true } as never,
      mockCache() as never,
    );

    const released = await service.releasePendingPayment('appt-1', 'noop');
    expect(released).toBe(false);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('cancela CONFIRMED com charge ainda PENDING (recuperação de bypass)', async () => {
    const appt = {
      id: 'appt-bypass',
      tenantId: 't1',
      status: AppointmentStatus.CONFIRMED,
      startsAt: new Date('2026-08-10T15:00:00.000Z'),
      tenant: { id: 't1', name: 'Demo', slug: 'demo', timezone: 'America/Sao_Paulo' },
      pixCharge: { id: 'ch-1', status: PixChargeStatus.PENDING },
    };
    const pixChargeUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const appointmentUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      appointment: { findUnique: jest.fn().mockResolvedValue(appt) },
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          pixCharge: { updateMany: pixChargeUpdateMany },
          appointment: { updateMany: appointmentUpdateMany },
          waitlistEntry: {
            findFirst: jest.fn().mockResolvedValue(null),
            updateMany: jest.fn(),
          },
        }),
      ),
    };
    const service = new PixLifecycleService(
      prisma as never,
      { enqueueWaitlistSlotOpen: jest.fn() } as never,
      { runsBackgroundJobs: true } as never,
      mockCache() as never,
    );

    const released = await service.releasePendingPayment('appt-bypass', 'PIX expirado');
    expect(released).toBe(true);
    expect(appointmentUpdateMany).toHaveBeenCalledWith({
      where: { id: 'appt-bypass', status: { in: [AppointmentStatus.CONFIRMED] } },
      data: expect.objectContaining({ status: AppointmentStatus.CANCELLED }),
    });
  });
});

describe('PixLifecycleService — webhook idempotency (confirmPaid)', () => {
  function buildConfirmPrisma(firstClaimCount: number, secondClaimCount: number) {
    let call = 0;
    const enqueueBookingConfirmation = jest.fn();
    const prisma = {
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
        call += 1;
        const claimCount = call === 1 ? firstClaimCount : secondClaimCount;
        return fn({
          pixCharge: {
            updateMany: jest.fn().mockResolvedValue({ count: claimCount }),
            findUnique: jest.fn().mockResolvedValue({ status: PixChargeStatus.PAID }),
          },
          appointment: {
            updateMany: jest.fn().mockResolvedValue({ count: claimCount > 0 ? 1 : 0 }),
          },
        });
      }),
    };
    const notifications = { enqueueBookingConfirmation };
    const service = new PixLifecycleService(
      prisma as never,
      notifications as never,
      {
        runsBackgroundJobs: true,
      } as never,
      mockCache() as never,
    );
    return { service, enqueueBookingConfirmation, prisma };
  }

  it('duplicata de webhook não re-notifica nem reconfirma', async () => {
    const { service, enqueueBookingConfirmation } = buildConfirmPrisma(1, 0);

    const first = await service.confirmPaid('appt-1');
    const second = await service.confirmPaid('appt-1');

    expect(first).toBe('confirmed');
    expect(second).toBe('already_paid');
    expect(enqueueBookingConfirmation).toHaveBeenCalledTimes(1);
    expect(enqueueBookingConfirmation).toHaveBeenCalledWith('appt-1');
  });

  it('segundo claim concorrente (count 0 sem PAID ainda) retorna skipped sem notify', async () => {
    const enqueueBookingConfirmation = jest.fn();
    const prisma = {
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
        return fn({
          pixCharge: {
            updateMany: jest.fn().mockResolvedValue({ count: 0 }),
            findUnique: jest.fn().mockResolvedValue({ status: PixChargeStatus.EXPIRED }),
          },
          appointment: { updateMany: jest.fn() },
        });
      }),
    };
    const service = new PixLifecycleService(
      prisma as never,
      { enqueueBookingConfirmation } as never,
      { runsBackgroundJobs: true } as never,
      mockCache() as never,
    );

    await expect(service.confirmPaid('appt-1')).resolves.toBe('skipped');
    expect(enqueueBookingConfirmation).not.toHaveBeenCalled();
  });
});

describe('PixLifecycleService — PROCESS_ROLE gating', () => {
  it('não inicia timer quando runsBackgroundJobs=false', () => {
    const service = new PixLifecycleService(
      {} as never,
      {} as never,
      { runsBackgroundJobs: false } as never,
      mockCache() as never,
    );
    service.onModuleInit();
    expect((service as unknown as { timer: unknown }).timer).toBeNull();
  });
});

describe('PixLifecycleService — distributed lock', () => {
  it('skip reconcile quando lock busy (outro worker)', async () => {
    const prisma = {
      pixCharge: { findMany: jest.fn() },
      appointment: { findMany: jest.fn() },
    };
    const cache = mockCache('busy');
    const service = new PixLifecycleService(
      prisma as never,
      {} as never,
      { runsBackgroundJobs: true } as never,
      cache as never,
    );

    await expect(service.reconcileExpired()).resolves.toBe(0);
    expect(cache.tryAcquireLock).toHaveBeenCalled();
    expect(prisma.pixCharge.findMany).not.toHaveBeenCalled();
  });

  it('roda reconcile quando lock acquired', async () => {
    const prisma = {
      pixCharge: { findMany: jest.fn().mockResolvedValue([]) },
      appointment: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const cache = mockCache('acquired');
    const service = new PixLifecycleService(
      prisma as never,
      {} as never,
      { runsBackgroundJobs: true } as never,
      cache as never,
    );

    await expect(service.reconcileExpired()).resolves.toBe(0);
    expect(prisma.pixCharge.findMany).toHaveBeenCalled();
  });

  it('degrada e roda quando Redis lock unavailable', async () => {
    const prisma = {
      pixCharge: { findMany: jest.fn().mockResolvedValue([]) },
      appointment: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const cache = mockCache('unavailable');
    const service = new PixLifecycleService(
      prisma as never,
      {} as never,
      { runsBackgroundJobs: true } as never,
      cache as never,
    );

    await expect(service.reconcileExpired()).resolves.toBe(0);
    expect(prisma.pixCharge.findMany).toHaveBeenCalled();
  });
});
