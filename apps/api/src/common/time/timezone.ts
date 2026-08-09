/**
 * Utilitários de fuso horário (UTC no banco ↔ horário local na UI).
 * A lógica completa de slots entra na Fase 3; aqui já fixamos o contrato.
 */

/** Converte Date UTC para partes civis no timezone IANA (ex: America/Sao_Paulo). */
export function getZonedParts(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });

  const parts = fmt.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '0';

  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')),
    minute: Number(get('minute')),
    second: Number(get('second')),
  };
}

/** Minutos desde meia-noite no timezone informado. */
export function getMinuteOfDay(date: Date, timeZone: string): number {
  const { hour, minute } = getZonedParts(date, timeZone);
  return hour * 60 + minute;
}
