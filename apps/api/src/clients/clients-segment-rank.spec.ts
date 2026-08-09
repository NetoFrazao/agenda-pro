import { resolveClientSegment } from './client-segment';

/**
 * Espelha a estratégia Fase 7: rankear candidatos com métricas COMPLETED
 * e filtrar segmento *antes* do slice de página (total correto).
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
    // Contraste com bug Fase 5: total pós-filtro de página ficaria 0–pageSize errado
    expect(vip.length).not.toBe(ranked.length);
  });
});
