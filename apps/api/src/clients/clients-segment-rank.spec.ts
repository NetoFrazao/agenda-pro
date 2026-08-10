import { resolveClientSegment } from './client-segment';
import { ClientsService } from './clients.service';

/**
 * Estratégia: filtrar segmento *antes* do slice de página (total correto).
 * Implementação atual: CASE no SQL + LIMIT/OFFSET (sem full-scan JS).
 */
describe('CRM segment pre-pagination strategy', () => {
  const NOW = new Date('2026-08-09T12:00:00.000Z');

  function daysAgo(n: number) {
    return new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);
  }

  it('pagina só após filtrar segmento (total = matches, não pageSize)', () => {
    const ranked = [
      {
        id: 'a',
        createdAt: daysAgo(10),
        completedCount: 1,
        totalSpentCents: 5000,
        lastVisitAt: daysAgo(5),
      },
      {
        id: 'b',
        createdAt: daysAgo(200),
        completedCount: 12,
        totalSpentCents: 80_000,
        lastVisitAt: daysAgo(3),
      },
      {
        id: 'c',
        createdAt: daysAgo(100),
        completedCount: 4,
        totalSpentCents: 20_000,
        lastVisitAt: daysAgo(7),
      },
      {
        id: 'd',
        createdAt: daysAgo(90),
        completedCount: 2,
        totalSpentCents: 10_000,
        lastVisitAt: daysAgo(45),
      },
    ].map((row) => ({
      id: row.id,
      segment: resolveClientSegment({
        completedCount: row.completedCount,
        totalSpentCents: row.totalSpentCents,
        lastVisitAt: row.lastVisitAt,
        clientCreatedAt: row.createdAt,
        now: NOW,
      }),
    }));

    const vip = ranked.filter((r) => r.segment === 'vip');
    expect(vip.map((v) => v.id)).toEqual(['b']);

    const pageSize = 20;
    const page = 1;
    const slice = vip.slice((page - 1) * pageSize, page * pageSize);
    expect(vip.length).toBe(1);
    expect(slice).toHaveLength(1);
    expect(vip.length).not.toBe(ranked.length);
  });
});

describe('ClientsService list — segment via SQL', () => {
  it('usa $queryRaw para IDs/total e não faz findMany de ranking full-tenant', async () => {
    const queryRaw = jest
      .fn()
      .mockResolvedValueOnce([{ total: BigInt(1) }])
      .mockResolvedValueOnce([{ id: 'b' }]);
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 'b',
        name: 'VIP',
        phone: '11999999999',
        email: null,
        notes: null,
        tags: [],
        birthday: null,
        marketingOptIn: false,
        loyaltyPoints: 0,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        _count: { appointments: 12 },
      },
    ]);
    const groupBy = jest.fn().mockResolvedValue([]);
    const prisma = {
      $queryRaw: queryRaw,
      client: { findMany, count: jest.fn() },
      appointment: { groupBy },
    };
    const service = new ClientsService(prisma as never);

    const result = await service.list('tenant-1', undefined, 1, 20, { segment: 'vip' });

    expect(queryRaw).toHaveBeenCalledTimes(2);
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany.mock.calls[0][0].where).toEqual(
      expect.objectContaining({ id: { in: ['b'] }, tenantId: 'tenant-1' }),
    );
    // Sem full-scan: findMany de ranking (só id/createdAt de todo o tenant) não existe
    expect(findMany.mock.calls[0][0].select).toBeUndefined();
    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].segment).toBe('vip');
  });

  it('retorna vazio sem findMany de clientes quando SQL não acha IDs', async () => {
    const queryRaw = jest
      .fn()
      .mockResolvedValueOnce([{ total: BigInt(0) }])
      .mockResolvedValueOnce([]);
    const findMany = jest.fn();
    const prisma = {
      $queryRaw: queryRaw,
      client: { findMany },
      appointment: { groupBy: jest.fn() },
    };
    const service = new ClientsService(prisma as never);

    const result = await service.list('tenant-1', undefined, 1, 20, { segment: 'inactive' });
    expect(result).toEqual({ total: 0, page: 1, pageSize: 20, items: [] });
    expect(findMany).not.toHaveBeenCalled();
  });
});
