import { inactiveBucket, resolveClientSegment, visitsPerMonth } from './client-segment';

const NOW = new Date('2026-08-09T12:00:00.000Z');

function daysAgo(n: number): Date {
  return new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);
}

describe('resolveClientSegment', () => {
  it('new: poucas visitas recentes', () => {
    expect(
      resolveClientSegment({
        completedCount: 1,
        totalSpentCents: 8000,
        lastVisitAt: daysAgo(5),
        clientCreatedAt: daysAgo(10),
        now: NOW,
      }),
    ).toBe('new');
  });

  it('new: nunca completou e cadastro recente', () => {
    expect(
      resolveClientSegment({
        completedCount: 0,
        totalSpentCents: 0,
        lastVisitAt: null,
        clientCreatedAt: daysAgo(7),
        now: NOW,
      }),
    ).toBe('new');
  });

  it('frequent: ≥3 visitas e última < 30d', () => {
    expect(
      resolveClientSegment({
        completedCount: 4,
        totalSpentCents: 20000,
        lastVisitAt: daysAgo(10),
        clientCreatedAt: daysAgo(120),
        now: NOW,
      }),
    ).toBe('frequent');
  });

  it('vip por visitas (≥10) mesmo com gasto baixo', () => {
    expect(
      resolveClientSegment({
        completedCount: 12,
        totalSpentCents: 10000,
        lastVisitAt: daysAgo(3),
        clientCreatedAt: daysAgo(400),
        now: NOW,
      }),
    ).toBe('vip');
  });

  it('vip por gasto (≥ R$500)', () => {
    expect(
      resolveClientSegment({
        completedCount: 4,
        totalSpentCents: 50_000,
        lastVisitAt: daysAgo(3),
        clientCreatedAt: daysAgo(100),
        now: NOW,
      }),
    ).toBe('vip');
  });

  it('at_risk: 30–59 dias sem visita', () => {
    expect(
      resolveClientSegment({
        completedCount: 5,
        totalSpentCents: 80_000,
        lastVisitAt: daysAgo(45),
        clientCreatedAt: daysAgo(200),
        now: NOW,
      }),
    ).toBe('at_risk');
  });

  it('inactive prevalece sobre vip quando ≥60d', () => {
    expect(
      resolveClientSegment({
        completedCount: 20,
        totalSpentCents: 200_000,
        lastVisitAt: daysAgo(70),
        clientCreatedAt: daysAgo(400),
        now: NOW,
      }),
    ).toBe('inactive');
  });

  it('inactive: nunca completou e cadastro ≥60d', () => {
    expect(
      resolveClientSegment({
        completedCount: 0,
        totalSpentCents: 0,
        lastVisitAt: null,
        clientCreatedAt: daysAgo(90),
        now: NOW,
      }),
    ).toBe('inactive');
  });
});

describe('inactiveBucket', () => {
  it('null se visita recente', () => {
    expect(inactiveBucket(daysAgo(10), NOW)).toBeNull();
  });
  it('30 / 60 / 90', () => {
    expect(inactiveBucket(daysAgo(35), NOW)).toBe(30);
    expect(inactiveBucket(daysAgo(65), NOW)).toBe(60);
    expect(inactiveBucket(daysAgo(100), NOW)).toBe(90);
  });
});

describe('visitsPerMonth', () => {
  it('0 sem visitas', () => {
    expect(visitsPerMonth(0, null, NOW)).toBe(0);
  });
  it('calcula frequência aproximada', () => {
    // 6 visitas em ~60 dias → ~3/mês
    expect(visitsPerMonth(6, daysAgo(60), NOW)).toBe(3);
  });
});
