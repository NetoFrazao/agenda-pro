import { LoyaltyTxnType, Prisma } from '@prisma/client';
import { computeLoyaltyPoints, creditLoyaltyForCompletedVisit } from './loyalty-credit';

describe('computeLoyaltyPoints', () => {
  it('1 ponto por real com multiplier 1', () => {
    expect(computeLoyaltyPoints(2500, 1)).toBe(25);
  });
  it('ignora centavos parciais', () => {
    expect(computeLoyaltyPoints(199, 1)).toBe(1);
  });
  it('zero se desabilitado via multiplier/preço', () => {
    expect(computeLoyaltyPoints(0, 1)).toBe(0);
    expect(computeLoyaltyPoints(1000, 0)).toBe(0);
  });
});

describe('creditLoyaltyForCompletedVisit', () => {
  const base = {
    tenantId: 't1',
    clientId: 'c1',
    appointmentId: 'a1',
    priceCents: 10000,
    pointsPerReal: 1,
    loyaltyEnabled: true,
  };

  it('não credita se loyalty desligado', async () => {
    const tx = {
      loyaltyTransaction: { create: jest.fn() },
      client: { update: jest.fn() },
    };
    const res = await creditLoyaltyForCompletedVisit(tx, { ...base, loyaltyEnabled: false });
    expect(res).toEqual({ credited: false, points: 0 });
    expect(tx.loyaltyTransaction.create).not.toHaveBeenCalled();
  });

  it('credita uma vez: ledger + increment', async () => {
    const tx = {
      loyaltyTransaction: { create: jest.fn().mockResolvedValue({}) },
      client: { update: jest.fn().mockResolvedValue({}) },
    };
    const res = await creditLoyaltyForCompletedVisit(tx, base);
    expect(res).toEqual({ credited: true, points: 100 });
    expect(tx.loyaltyTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        appointmentId: 'a1',
        type: LoyaltyTxnType.CREDIT,
        points: 100,
        reason: 'COMPLETED_VISIT',
      }),
    });
    expect(tx.client.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { loyaltyPoints: { increment: 100 } },
    });
  });

  it('impede double-credit: unique P2002 não incrementa de novo', async () => {
    const duplicate = new Prisma.PrismaClientKnownRequestError('Unique', {
      code: 'P2002',
      clientVersion: 'test',
    });
    const tx = {
      loyaltyTransaction: { create: jest.fn().mockRejectedValue(duplicate) },
      client: { update: jest.fn() },
    };
    const res = await creditLoyaltyForCompletedVisit(tx, base);
    expect(res).toEqual({ credited: false, points: 0 });
    expect(tx.client.update).not.toHaveBeenCalled();
  });

  it('COMPLETED→…→COMPLETED simulado: segunda chamada é no-op', async () => {
    let created = false;
    const tx = {
      loyaltyTransaction: {
        create: jest.fn(async () => {
          if (created) {
            throw new Prisma.PrismaClientKnownRequestError('Unique', {
              code: 'P2002',
              clientVersion: 'test',
            });
          }
          created = true;
          return {};
        }),
      },
      client: { update: jest.fn().mockResolvedValue({}) },
    };

    const first = await creditLoyaltyForCompletedVisit(tx, base);
    const second = await creditLoyaltyForCompletedVisit(tx, base);
    expect(first.credited).toBe(true);
    expect(second.credited).toBe(false);
    expect(tx.client.update).toHaveBeenCalledTimes(1);
  });
});
