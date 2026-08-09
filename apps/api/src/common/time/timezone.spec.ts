import { getMinuteOfDay, getZonedParts } from './timezone';

describe('timezone helpers', () => {
  it('extrai partes civis em America/Sao_Paulo', () => {
    // 2024-01-15 15:00 UTC = 12:00 em São Paulo (UTC-3)
    const date = new Date('2024-01-15T15:00:00.000Z');
    const parts = getZonedParts(date, 'America/Sao_Paulo');

    expect(parts.year).toBe(2024);
    expect(parts.month).toBe(1);
    expect(parts.day).toBe(15);
    expect(parts.hour).toBe(12);
    expect(parts.minute).toBe(0);
  });

  it('calcula minuto do dia no fuso local', () => {
    const date = new Date('2024-01-15T15:30:00.000Z'); // 12:30 BRT
    expect(getMinuteOfDay(date, 'America/Sao_Paulo')).toBe(12 * 60 + 30);
  });
});
