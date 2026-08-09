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

  it('grade de 15min ancora no início da janela', () => {
    const dateKey = '2024-06-10';
    const slots = computeDaySlots({
      dateKey,
      timeZone,
      durationMinutes: 30,
      stepMinutes: 15,
      rules: [{ dayOfWeek: 1, startMinute: 9 * 60, endMinute: 10 * 60, isActive: true }],
      exceptions: [],
      busy: [],
      now: zonedCivilToUtc(dateKey, 8 * 60, timeZone),
    });
    const times = slots.map((s) => s.toISOString());
    expect(times).toEqual([
      zonedCivilToUtc(dateKey, 9 * 60, timeZone).toISOString(),
      zonedCivilToUtc(dateKey, 9 * 60 + 15, timeZone).toISOString(),
      zonedCivilToUtc(dateKey, 9 * 60 + 30, timeZone).toISOString(),
    ]);
  });

  it('buffer bloqueia vizinhos imediatos de um horário ocupado', () => {
    const dateKey = '2024-06-10';
    const busyStart = zonedCivilToUtc(dateKey, 10 * 60, timeZone);
    const busyEnd = new Date(busyStart.getTime() + 30 * 60_000);

    const slots = computeDaySlots({
      dateKey,
      timeZone,
      durationMinutes: 30,
      stepMinutes: 30,
      bufferMinutes: 15,
      rules: [{ dayOfWeek: 1, startMinute: 9 * 60, endMinute: 12 * 60, isActive: true }],
      exceptions: [],
      busy: [{ startsAt: busyStart, endsAt: busyEnd }],
      now: zonedCivilToUtc(dateKey, 8 * 60, timeZone),
    });

    const times = slots.map((s) => s.toISOString());
    // 09:30–10:00 encostaria no ocupado (10:00) sem respeitar os 15min de folga
    expect(times).not.toContain(zonedCivilToUtc(dateKey, 9 * 60 + 30, timeZone).toISOString());
    // 10:30–11:00 idem na saída
    expect(times).not.toContain(zonedCivilToUtc(dateKey, 10 * 60 + 30, timeZone).toISOString());
    expect(times).toContain(zonedCivilToUtc(dateKey, 9 * 60, timeZone).toISOString());
    expect(times).toContain(zonedCivilToUtc(dateKey, 11 * 60, timeZone).toISOString());
  });

  it('antecedência mínima corta slots muito próximos de agora', () => {
    const dateKey = '2024-06-10';
    const slots = computeDaySlots({
      dateKey,
      timeZone,
      durationMinutes: 30,
      stepMinutes: 30,
      minNoticeMinutes: 60,
      rules: [{ dayOfWeek: 1, startMinute: 9 * 60, endMinute: 11 * 60, isActive: true }],
      exceptions: [],
      busy: [],
      now: zonedCivilToUtc(dateKey, 9 * 60, timeZone),
    });
    const times = slots.map((s) => s.toISOString());
    // agora = 09:00, antecedência 60min → 09:30 fora, 10:00 e 10:30 ok
    expect(times).not.toContain(zonedCivilToUtc(dateKey, 9 * 60 + 30, timeZone).toISOString());
    expect(times).toContain(zonedCivilToUtc(dateKey, 10 * 60, timeZone).toISOString());
  });

  it('hasOverlap com buffer detecta conflito encostado', () => {
    const aStart = new Date('2024-01-01T13:00:00.000Z');
    const aEnd = new Date('2024-01-01T13:30:00.000Z');
    // Ocupado logo em seguida (13:30–14:00): sem buffer ok, com buffer conflita
    const busy = [
      {
        startsAt: new Date('2024-01-01T13:30:00.000Z'),
        endsAt: new Date('2024-01-01T14:00:00.000Z'),
      },
    ];
    expect(hasOverlap(aStart, aEnd, busy)).toBe(false);
    expect(hasOverlap(aStart, aEnd, busy, 10)).toBe(true);
  });
});
