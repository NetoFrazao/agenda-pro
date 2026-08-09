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
