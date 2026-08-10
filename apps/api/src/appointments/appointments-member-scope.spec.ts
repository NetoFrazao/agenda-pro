import { AppointmentsService } from './appointments.service';

describe('AppointmentsService.list — RBAC MEMBER', () => {
  it('MEMBER força professionalId = actor.userId (ignora query alheia)', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const prisma = { appointment: { findMany, count } };
    const service = new AppointmentsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

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
    const prisma = { appointment: { findMany, count } };
    const service = new AppointmentsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

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
