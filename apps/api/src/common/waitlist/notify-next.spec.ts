import { WaitlistStatus } from '@prisma/client';
import { notifyNextWaitlistCandidate } from './notify-next';

describe('notifyNextWaitlistCandidate', () => {
  it('claim atômico: notifica 1 e marca NOTIFIED', async () => {
    const entry = {
      id: 'w1',
      clientName: 'Ana',
      clientPhone: '11999990000',
      clientEmail: 'a@x.com',
    };
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const findFirst = jest.fn().mockResolvedValue(entry);
    const prisma = {
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({ waitlistEntry: { findFirst, updateMany } }),
      ),
    };
    const enqueue = jest.fn().mockResolvedValue(undefined);

    const ok = await notifyNextWaitlistCandidate(
      prisma as never,
      { enqueueWaitlistSlotOpen: enqueue },
      'tenant-1',
      new Date('2024-06-10T15:00:00.000Z'),
      { name: 'Barbearia', slug: 'bar', timezone: 'America/Sao_Paulo' },
    );

    expect(ok).toBe(true);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'w1', status: WaitlistStatus.WAITING },
        data: expect.objectContaining({ status: WaitlistStatus.NOTIFIED }),
      }),
    );
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue.mock.calls[0][0].clientName).toBe('Ana');
  });

  it('sem candidatos: retorna false e não enfileira', async () => {
    const prisma = {
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          waitlistEntry: {
            findFirst: jest.fn().mockResolvedValue(null),
            updateMany: jest.fn(),
          },
        }),
      ),
    };
    const enqueue = jest.fn();

    const ok = await notifyNextWaitlistCandidate(
      prisma as never,
      { enqueueWaitlistSlotOpen: enqueue },
      'tenant-1',
      new Date('2024-06-10T15:00:00.000Z'),
      { name: 'Barbearia', slug: 'bar', timezone: 'America/Sao_Paulo' },
    );

    expect(ok).toBe(false);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('corrida perdida (updateMany=0): não notifica', async () => {
    const prisma = {
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          waitlistEntry: {
            findFirst: jest.fn().mockResolvedValue({
              id: 'w1',
              clientName: 'Ana',
              clientPhone: '1199',
              clientEmail: null,
            }),
            updateMany: jest.fn().mockResolvedValue({ count: 0 }),
          },
        }),
      ),
    };
    const enqueue = jest.fn();

    const ok = await notifyNextWaitlistCandidate(
      prisma as never,
      { enqueueWaitlistSlotOpen: enqueue },
      'tenant-1',
      new Date('2024-06-10T15:00:00.000Z'),
      { name: 'Barbearia', slug: 'bar', timezone: 'UTC' },
    );

    expect(ok).toBe(false);
    expect(enqueue).not.toHaveBeenCalled();
  });
});
