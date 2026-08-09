import { NotFoundException } from '@nestjs/common';
import { AccountService } from './account.service';

describe('AccountService — A-04 LGPD', () => {
  it('exportData agrega PII do tenant sem hard-delete', async () => {
    const tenant = {
      id: 't1',
      slug: 'demo',
      name: 'Demo',
      timezone: 'America/Sao_Paulo',
      plan: 'PRO',
      about: null,
      address: null,
      whatsapp: null,
      createdAt: new Date(),
    };
    const prisma = {
      tenant: { findFirst: jest.fn().mockResolvedValue(tenant) },
      user: { findMany: jest.fn().mockResolvedValue([{ id: 'u1', email: 'a@b.com' }]) },
      client: { findMany: jest.fn().mockResolvedValue([]) },
      service: { findMany: jest.fn().mockResolvedValue([]) },
      appointment: { findMany: jest.fn().mockResolvedValue([]) },
      waitlistEntry: { findMany: jest.fn().mockResolvedValue([]) },
      review: { findMany: jest.fn().mockResolvedValue([]) },
      subscription: { findUnique: jest.fn().mockResolvedValue({ plan: 'PRO', status: 'ACTIVE' }) },
      pixCharge: { findMany: jest.fn().mockResolvedValue([{ amountCents: 1000, status: 'PAID' }]) },
    };
    const billing = { cancelImmediatelyForAccountDeletion: jest.fn() };
    const service = new AccountService(prisma as never, billing as never);

    const exported = await service.exportData('t1');
    expect(exported.tenant.slug).toBe('demo');
    expect(exported.users).toHaveLength(1);
    expect(exported.pixCharges[0].amountCents).toBe(1000);
    expect(billing.cancelImmediatelyForAccountDeletion).not.toHaveBeenCalled();
  });

  it('deleteAccount cancela Stripe, soft-delete e anonimiza sem apagar PixCharge', async () => {
    const tx = {
      tenant: {
        update: jest.fn(),
      },
      client: {
        findMany: jest.fn().mockResolvedValue([{ id: 'c1' }]),
        update: jest.fn(),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([{ id: 'u1' }]),
        update: jest.fn(),
      },
      appointment: {
        findMany: jest.fn().mockResolvedValue([{ id: 'a1' }]),
        update: jest.fn(),
      },
      notificationJob: { deleteMany: jest.fn() },
      refreshToken: { deleteMany: jest.fn() },
      passwordResetToken: { deleteMany: jest.fn() },
      waitlistEntry: { deleteMany: jest.fn() },
      review: { updateMany: jest.fn() },
      pixCharge: { updateMany: jest.fn() },
      service: { updateMany: jest.fn() },
    };
    const prisma = {
      tenant: {
        findFirst: jest.fn().mockResolvedValue({ id: 't1', deletedAt: null }),
      },
      $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
    };
    const billing = {
      cancelImmediatelyForAccountDeletion: jest.fn().mockResolvedValue(undefined),
    };
    const service = new AccountService(prisma as never, billing as never);

    const result = await service.deleteAccount('t1', 'u1');

    expect(billing.cancelImmediatelyForAccountDeletion).toHaveBeenCalledWith('t1');
    expect(tx.pixCharge.updateMany).toHaveBeenCalledWith({
      where: { tenantId: 't1' },
      data: { copyPaste: null, qrCodeBase64: null },
    });
    expect(tx.tenant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 't1' },
        data: expect.objectContaining({ deletedAt: expect.any(Date) }),
      }),
    );
    expect(result.ok).toBe(true);
    expect(result.retention).toMatch(/PixCharge/);
  });

  it('exportData 404 se tenant já excluído', async () => {
    const prisma = { tenant: { findFirst: jest.fn().mockResolvedValue(null) } };
    const service = new AccountService(prisma as never, {} as never);
    await expect(service.exportData('missing')).rejects.toBeInstanceOf(NotFoundException);
  });
});
