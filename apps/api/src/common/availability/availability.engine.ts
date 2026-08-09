/**
 * Motor de disponibilidade (Fase 3).
 * Cruza regras semanais + exceções + agendamentos existentes → slots livres.
 * Datas de entrada/saída em ISO UTC; regras em minutos locais do timezone do tenant.
 */

import { AppointmentStatus } from '@prisma/client';
import { getZonedParts } from '../time/timezone';

export { dateOnlyToDateKey } from '../time/timezone';

export type AvailabilityRuleLike = {
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
  isActive: boolean;
};

export type AvailabilityExceptionLike = {
  /** YYYY-MM-DD no timezone do tenant */
  dateKey: string;
  isAvailable: boolean;
  startMinute: number | null;
  endMinute: number | null;
};

export type BusyInterval = {
  startsAt: Date;
  endsAt: Date;
};

export const ACTIVE_APPOINTMENT_STATUSES: AppointmentStatus[] = [
  AppointmentStatus.PENDING_PAYMENT,
  AppointmentStatus.SCHEDULED,
  AppointmentStatus.CONFIRMED,
];

/** Formata data civil YYYY-MM-DD no timezone. */
export function toDateKey(date: Date, timeZone: string): string {
  const { year, month, day } = getZonedParts(date, timeZone);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Constrói um Date UTC a partir de data civil + minuto do dia no timezone. */
export function zonedCivilToUtc(dateKey: string, minuteOfDay: number, timeZone: string): Date {
  const [y, m, d] = dateKey.split('-').map(Number);
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;

  // Estratégia: estimar UTC e ajustar pelo offset real do timezone (iteração única).
  const guess = new Date(Date.UTC(y, m - 1, d, hour, minute, 0));
  const parts = getZonedParts(guess, timeZone);
  const asLocalMs = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  const desiredMs = Date.UTC(y, m - 1, d, hour, minute, 0);
  const offset = asLocalMs - guess.getTime();
  return new Date(desiredMs - offset);
}

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Gera slots de início (UTC) para um dia civil.
 * - stepMinutes: grade fixa exibida ao cliente (padrão de mercado: 15min)
 * - bufferMinutes: intervalo obrigatório antes/depois de cada atendimento
 * - minNoticeMinutes: antecedência mínima para aceitar o agendamento
 */
export function computeDaySlots(input: {
  dateKey: string;
  timeZone: string;
  durationMinutes: number;
  stepMinutes?: number;
  bufferMinutes?: number;
  minNoticeMinutes?: number;
  rules: AvailabilityRuleLike[];
  exceptions: AvailabilityExceptionLike[];
  busy: BusyInterval[];
  now?: Date;
}): Date[] {
  const {
    dateKey,
    timeZone,
    durationMinutes,
    stepMinutes = 15,
    bufferMinutes = 0,
    minNoticeMinutes = 0,
    rules,
    exceptions,
    busy,
    now = new Date(),
  } = input;

  const sample = zonedCivilToUtc(dateKey, 12 * 60, timeZone);
  // weekday no timezone do tenant (Sun=0 ... Sat=6)
  const weekdayFmt = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' });
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const dow = map[weekdayFmt.format(sample)] ?? 0;

  const exception = exceptions.find((e) => e.dateKey === dateKey);
  let windows: Array<{ start: number; end: number }> = [];

  if (exception) {
    if (!exception.isAvailable) {
      return [];
    }
    if (exception.startMinute != null && exception.endMinute != null) {
      windows = [{ start: exception.startMinute, end: exception.endMinute }];
    }
  } else {
    windows = rules
      .filter((r) => r.isActive && r.dayOfWeek === dow)
      .map((r) => ({ start: r.startMinute, end: r.endMinute }));
  }

  const slots: Date[] = [];
  const minStartMs = now.getTime() + minNoticeMinutes * 60_000;
  // Buffer é aplicado expandindo os intervalos ocupados nas duas pontas:
  // um horário só é oferecido se respeitar a folga antes e depois do vizinho.
  const bufferMs = bufferMinutes * 60_000;

  for (const win of windows) {
    // Grade ancorada no início da janela (ex: 09:00, 09:15, 09:30...)
    for (let startMin = win.start; startMin + durationMinutes <= win.end; startMin += stepMinutes) {
      const startsAt = zonedCivilToUtc(dateKey, startMin, timeZone);
      const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);

      if (startsAt.getTime() < minStartMs) continue;

      const conflict = busy.some((b) =>
        overlaps(
          startsAt,
          endsAt,
          new Date(b.startsAt.getTime() - bufferMs),
          new Date(b.endsAt.getTime() + bufferMs),
        ),
      );
      if (conflict) continue;

      slots.push(startsAt);
    }
  }

  return slots;
}

/** Detecta conflito de overlap com intervalos ocupados (buffer opcional). */
export function hasOverlap(
  startsAt: Date,
  endsAt: Date,
  busy: BusyInterval[],
  bufferMinutes = 0,
): boolean {
  const bufferMs = bufferMinutes * 60_000;
  return busy.some((b) =>
    overlaps(
      startsAt,
      endsAt,
      new Date(b.startsAt.getTime() - bufferMs),
      new Date(b.endsAt.getTime() + bufferMs),
    ),
  );
}

/** Início do mês civil no timezone do tenant (limite mensal de bookings — M-04). */
export function startOfMonthInTimeZone(now: Date, timeZone: string): Date {
  const { year, month } = getZonedParts(now, timeZone);
  const dateKey = `${year}-${String(month).padStart(2, '0')}-01`;
  return zonedCivilToUtc(dateKey, 0, timeZone);
}
