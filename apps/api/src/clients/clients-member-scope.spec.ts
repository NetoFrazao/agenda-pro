import { NotFoundException } from '@nestjs/common';
import { ClientsService } from './clients.service';

describe('ClientsService — MEMBER scope', () => {
  it('list MEMBER restringe a clientes com appointment do profissional', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const prisma = {
      client: { findMany, count },
      appointment: { findMany: jest.fn(), groupBy: jest.fn() },
    };
    const service = new ClientsService(prisma as never);

    await service.list('t1', undefined, 1, 20, {
      actor: { userId: 'member-1', role: 'MEMBER' },
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 't1',
          appointments: { some: { professionalId: 'member-1' } },
        }),
      }),
    );
  });

  it('detail MEMBER retorna 404 se cliente não tem vínculo', async () => {
    const prisma = {
      appointment: { findFirst: jest.fn().mockResolvedValue(null) },
      client: { findFirst: jest.fn() },
    };
    const service = new ClientsService(prisma as never);

    await expect(
      service.detail('t1', 'client-x', {
        actor: { userId: 'member-1', role: 'MEMBER' },
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.client.findFirst).not.toHaveBeenCalled();
  });
});
