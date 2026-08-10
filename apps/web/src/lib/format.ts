/** Formatação PT-BR para preços, datas e horários de parede. */

const DAY_NAMES = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

export function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

export function dayName(dayOfWeek: number): string {
  return DAY_NAMES[dayOfWeek] ?? `Dia ${dayOfWeek}`;
}

/** Converte minutos desde meia-noite em HH:mm. */
export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Converte string HH:mm em minutos desde meia-noite. */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + (m || 0);
}

export function formatDateTime(iso: string, timeZone?: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone,
  });
}

export function formatDate(isoOrYmd: string, timeZone?: string): string {
  const d = isoOrYmd.length === 10 ? new Date(`${isoOrYmd}T12:00:00`) : new Date(isoOrYmd);
  return d.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    timeZone,
  });
}

export function formatTime(iso: string, timeZone?: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  });
}

/** Placeholder de preços mensais quando a API não envia priceCentsMonthly. */
export const PLAN_PRICE_PLACEHOLDERS: Record<string, number> = {
  STARTER: 4900,
  PRO: 9900,
  BUSINESS: 19900,
};

export const APPOINTMENT_STATUS_LABEL: Record<string, string> = {
  PENDING_PAYMENT: 'Aguardando pagamento',
  SCHEDULED: 'Agendado',
  CONFIRMED: 'Confirmado',
  COMPLETED: 'Concluído',
  CANCELLED: 'Cancelado',
  NO_SHOW: 'Não compareceu',
};

export type BadgeTone = 'emerald' | 'sky' | 'amber' | 'red' | 'orange' | 'stone';

export const APPOINTMENT_STATUS_TONE: Record<string, BadgeTone> = {
  PENDING_PAYMENT: 'amber',
  SCHEDULED: 'sky',
  CONFIRMED: 'emerald',
  COMPLETED: 'stone',
  CANCELLED: 'red',
  NO_SHOW: 'orange',
};

/** Fração 0..1 → percentual pt-BR (ex.: 0.083 → "8,3%"). */
export function formatPercent(rate: number, digits = 1): string {
  return `${(rate * 100).toLocaleString('pt-BR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}%`;
}

/** Link wa.me a partir de um telefone BR (adiciona 55 se faltar). */
export function whatsappLink(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  const full = digits.startsWith('55') ? digits : `55${digits}`;
  return `https://wa.me/${full}`;
}

/** Data civil de hoje (YYYY-MM-DD) no fuso do browser. */
export function todayYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Data civil (YYYY-MM-DD) de um instante no fuso informado (tenant). */
export function ymdInTimeZone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** Hoje civil no fuso do tenant (fallback: browser). */
export function todayYmdInTimeZone(timeZone?: string | null): string {
  if (!timeZone) return todayYmd();
  try {
    return ymdInTimeZone(new Date(), timeZone);
  } catch {
    return todayYmd();
  }
}

/** Soma dias a uma data civil YYYY-MM-DD (calendário gregoriano, sem fuso). */
export function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

/** Primeiro dia do mês civil no fuso do tenant. */
export function firstDayOfMonthYmdInTimeZone(timeZone?: string | null): string {
  const today = todayYmdInTimeZone(timeZone);
  return `${today.slice(0, 7)}-01`;
}

/**
 * Interpreta YYYY-MM-DD + horário de parede no fuso `timeZone` e devolve ISO UTC.
 * Usado em filtros de agenda/relatórios para não depender do fuso do navegador.
 */
export function zonedWallTimeToIso(
  ymd: string,
  timeHms: string,
  timeZone?: string | null,
): string {
  const time = timeHms.length === 5 ? `${timeHms}:00` : timeHms;
  if (!timeZone) {
    return new Date(`${ymd}T${time}`).toISOString();
  }

  const desired = `${ymd}T${time}`;
  // Estimativa inicial em UTC; corrige pelo offset real do fuso.
  let utc = new Date(`${ymd}T${time}Z`);
  for (let i = 0; i < 3; i++) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(utc);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
    const asInTz = `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`;
    const deltaMs = new Date(`${desired}Z`).getTime() - new Date(`${asInTz}Z`).getTime();
    if (deltaMs === 0) break;
    utc = new Date(utc.getTime() + deltaMs);
  }
  return utc.toISOString();
}

/** Início (00:00:00) e fim (23:59:59.999) do dia civil no fuso do tenant → ISO UTC. */
export function zonedDayBoundsIso(
  ymd: string,
  timeZone?: string | null,
): { fromIso: string; toIso: string } {
  return {
    fromIso: zonedWallTimeToIso(ymd, '00:00:00', timeZone),
    toIso: zonedWallTimeToIso(ymd, '23:59:59', timeZone),
  };
}
