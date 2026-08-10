import { createAppointmentsTestFacade } from './appointments-test.util';
import { AppointmentStatus } from '@prisma/client';
import { ForbiddenException } from '@nestjs/common';

describe('AppointmentsService.list — RBAC MEMBER', () => {
  it('MEMBER força professionalId = actor.userId (ignora query alheia)', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const { service } = createAppointmentsTestFacade({
      prisma: { appointment: { findMany, count } },
    });

    await service.list('tenant-1', {
      professionalId: 'other-pro',
      actor: { userId: 'member-1', role: 'MEMBER' },
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-1',
          professionalId: 'member-1',
        }),
      }),
    );
  });

  it('OWNER respeita filtro professionalId da query', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const { service } = createAppointmentsTestFacade({
      prisma: { appointment: { findMany, count } },
    });

    await service.list('tenant-1', {
      professionalId: 'pro-2',
      actor: { userId: 'owner-1', role: 'OWNER' },
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          professionalId: 'pro-2',
        }),
      }),
    );
  });
});

describe('AppointmentsService.updateStatus — RBAC MEMBER', () => {
  it('MEMBER recebe 403 ao alterar agendamento de outro profissional', async () => {
    const findFirst = jest.fn().mockResolvedValue({
      id: 'a1',
      tenantId: 'tenant-1',
      professionalId: 'other-pro',
      status: AppointmentStatus.SCHEDULED,
      clientId: 'c1',
      serviceId: 's1',
      priceCentsSnapshot: 5000,
      cancelledAt: null,
      startsAt: new Date(Date.now() + 86_400_000),
      tenant: { loyaltyPointsPerReal: 1, loyaltyEnabled: false, slug: 'x' },
      service: { id: 's1', name: 'Corte', durationMinutes: 30 },
      pixCharge: null,
    });
    const update = jest.fn();
    const { service } = createAppointmentsTestFacade({
      prisma: { appointment: { findFirst, update }, $transaction: jest.fn() },
    });

    await expect(
      service.updateStatus('tenant-1', 'a1', AppointmentStatus.CONFIRMED, {
        userId: 'member-1',
        role: 'MEMBER',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(update).not.toHaveBeenCalled();
  });

  it('MEMBER pode alterar status da própria agenda', async () => {
    const findFirst = jest.fn().mockResolvedValue({
      id: 'a1',
      tenantId: 'tenant-1',
      professionalId: 'member-1',
      status: AppointmentStatus.SCHEDULED,
      clientId: 'c1',
      serviceId: 's1',
      priceCentsSnapshot: 5000,
      cancelledAt: null,
      startsAt: new Date(Date.now() + 86_400_000),
      tenant: { loyaltyPointsPerReal: 1, loyaltyEnabled: false, slug: 'x' },
      service: { id: 's1', name: 'Corte', durationMinutes: 30 },
      pixCharge: null,
    });
    const row = { id: 'a1', status: AppointmentStatus.CONFIRMED };
    const { service } = createAppointmentsTestFacade({
      prisma: {
        appointment: { findFirst },
        $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
          fn({
            appointment: { update: jest.fn().mockResolvedValue(row) },
          }),
        ),
      },
    });

    await expect(
      service.updateStatus('tenant-1', 'a1', AppointmentStatus.CONFIRMED, {
        userId: 'member-1',
        role: 'MEMBER',
      }),
    ).resolves.toMatchObject({ id: 'a1', status: AppointmentStatus.CONFIRMED });
  });

  it('OWNER pode alterar status de qualquer profissional do tenant', async () => {
    const findFirst = jest.fn().mockResolvedValue({
      id: 'a1',
      tenantId: 'tenant-1',
      professionalId: 'pro-2',
      status: AppointmentStatus.SCHEDULED,
      clientId: 'c1',
      serviceId: 's1',
      priceCentsSnapshot: 5000,
      cancelledAt: null,
      startsAt: new Date(Date.now() + 86_400_000),
      tenant: { loyaltyPointsPerReal: 1, loyaltyEnabled: false, slug: 'x' },
      service: { id: 's1', name: 'Corte', durationMinutes: 30 },
      pixCharge: null,
    });
    const confirmed = { id: 'a1', status: AppointmentStatus.CONFIRMED };
    const { service } = createAppointmentsTestFacade({
      prisma: {
        appointment: { findFirst },
        $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
          fn({
            appointment: { update: jest.fn().mockResolvedValue(confirmed) },
          }),
        ),
      },
    });

    await expect(
      service.updateStatus('tenant-1', 'a1', AppointmentStatus.CONFIRMED, {
        userId: 'owner-1',
        role: 'OWNER',
      }),
    ).resolves.toMatchObject({ id: 'a1', status: AppointmentStatus.CONFIRMED });
  });
});
