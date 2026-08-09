/**
 * Segmentação CRM (Fase 5).
 *
 * Prioridade (primeira regra que casar vence):
 * 1. inactive — sem visita COMPLETED há ≥ 60 dias (ou nunca completou e cadastro ≥ 60d)
 * 2. at_risk  — última COMPLETED há 30–59 dias
 * 3. vip      — ≥ 10 visitas concluídas OU gasto ≥ R$ 500 (50000 centavos)
 * 4. frequent — ≥ 3 visitas e última COMPLETED há < 30 dias
 * 5. new      — demais (0–2 visitas / base recente)
 */

export type ClientSegment = 'new' | 'frequent' | 'vip' | 'inactive' | 'at_risk';

/** Buckets para campanhas futuras (sem envio automático). */
export type InactiveBucket = 30 | 60 | 90;

export interface ClientSegmentInput {
  completedCount: number;
  totalSpentCents: number;
  /** Última visita COMPLETED; null se nunca concluiu */
  lastVisitAt: Date | null;
  clientCreatedAt: Date;
  now?: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const VIP_MIN_VISITS = 10;
const VIP_MIN_SPENT_CENTS = 50_000;
const FREQUENT_MIN_VISITS = 3;
const AT_RISK_DAYS = 30;
const INACTIVE_DAYS = 60;

export function daysSince(from: Date, now: Date): number {
  return Math.floor((now.getTime() - from.getTime()) / DAY_MS);
}

export function inactiveBucket(
  lastVisitAt: Date | null,
  now: Date = new Date(),
): InactiveBucket | null {
  if (!lastVisitAt) return null;
  const days = daysSince(lastVisitAt, now);
  if (days >= 90) return 90;
  if (days >= 60) return 60;
  if (days >= 30) return 30;
  return null;
}

export function resolveClientSegment(input: ClientSegmentInput): ClientSegment {
  const now = input.now ?? new Date();
  const last = input.lastVisitAt;
  const daysSinceVisit = last ? daysSince(last, now) : daysSince(input.clientCreatedAt, now);

  if (input.completedCount === 0) {
    if (daysSince(input.clientCreatedAt, now) >= INACTIVE_DAYS) return 'inactive';
    return 'new';
  }

  if (daysSinceVisit >= INACTIVE_DAYS) return 'inactive';
  if (daysSinceVisit >= AT_RISK_DAYS) return 'at_risk';

  if (input.completedCount >= VIP_MIN_VISITS || input.totalSpentCents >= VIP_MIN_SPENT_CENTS) {
    return 'vip';
  }

  if (input.completedCount >= FREQUENT_MIN_VISITS && daysSinceVisit < AT_RISK_DAYS) {
    return 'frequent';
  }

  return 'new';
}

/** Visitas/mês desde a primeira COMPLETED (mín. 1 mês). */
export function visitsPerMonth(
  completedCount: number,
  firstVisitAt: Date | null,
  now: Date = new Date(),
): number {
  if (completedCount <= 0 || !firstVisitAt) return 0;
  const months = Math.max(1, daysSince(firstVisitAt, now) / 30);
  return Math.round((completedCount / months) * 100) / 100;
}
