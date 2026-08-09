import {
  ACTIVE_APPOINTMENT_STATUSES,
  computeDaySlots,
  hasOverlap,
  toDateKey,
  zonedCivilToUtc,
} from './availability.engine';

describe('availability.engine', () => {
  const timeZone = 'America/Sao_Paulo';

  it('toDateKey respeita o fuso', () => {
    // 2024-06-10 02:00 UTC = ainda 09/06 à noite em SP?
    // 2024-06-10 03:00 UTC = 00:00 em SP (UTC-3)
    const d = new Date('2024-06-10T03:00:00.000Z');
    expect(toDateKey(d, timeZone)).toBe('2024-06-10');
  });

  it('gera slots dentro da janela e pula ocupados', () => {
    const dateKey = '2024-06-10'; // segunda-feira
    const busyStart = zonedCivilToUtc(dateKey, 10 * 60, timeZone);
    const busyEnd = new Date(busyStart.getTime() + 30 * 60_000);

    const slots = computeDaySlots({
      dateKey,
      timeZone,
      durationMinutes: 30,
      rules: [{ dayOfWeek: 1, startMinute: 9 * 60, endMinute: 11 * 60, isActive: true }],
      exceptions: [],
      busy: [{ startsAt: busyStart, endsAt: busyEnd }],
      now: zonedCivilToUtc(dateKey, 8 * 60, timeZone),
    });

    const times = slots.map((s) => s.toISOString());
    expect(times).toContain(zonedCivilToUtc(dateKey, 9 * 60, timeZone).toISOString());
    expect(times).toContain(zonedCivilToUtc(dateKey, 9 * 60 + 30, timeZone).toISOString());
    expect(times).not.toContain(busyStart.toISOString());
    expect(times).toContain(zonedCivilToUtc(dateKey, 10 * 60 + 30, timeZone).toISOString());
  });

  it('exceção de folga zera o dia', () => {
    const slots = computeDaySlots({
      dateKey: '2024-06-10',
      timeZone,
      durationMinutes: 30,
      rules: [{ dayOfWeek: 1, startMinute: 9 * 60, endMinute: 12 * 60, isActive: true }],
      exceptions: [
        { dateKey: '2024-06-10', isAvailable: false, startMinute: null, endMinute: null },
      ],
      busy: [],
      now: new Date('2024-06-01T12:00:00.000Z'),
    });
    expect(slots).toHaveLength(0);
  });

  it('hasOverlap detecta conflito parcial', () => {
    const a = new Date('2024-01-01T13:00:00.000Z');
    const b = new Date('2024-01-01T13:30:00.000Z');
    const c = new Date('2024-01-01T13:15:00.000Z');
    const d = new Date('2024-01-01T13:45:00.000Z');
    expect(hasOverlap(a, b, [{ startsAt: c, endsAt: d }])).toBe(true);
    expect(hasOverlap(a, b, [{ startsAt: b, endsAt: d }])).toBe(false);
  });

  it('exporta status ativos para booking', () => {
    expect(ACTIVE_APPOINTMENT_STATUSES).toContain('SCHEDULED');
    expect(ACTIVE_APPOINTMENT_STATUSES).not.toContain('CANCELLED');
  });
});
