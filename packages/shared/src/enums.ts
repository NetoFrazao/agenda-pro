/**
 * Enums / unions alinhados ao Prisma (`apps/api/prisma/schema.prisma`).
 * Fonte de verdade de contrato FE↔API para status de domínio.
 * Runtime da API continua usando `@prisma/client`; o web consome daqui.
 */

export const PLAN_CODES = ['STARTER', 'PRO', 'BUSINESS'] as const;
export type PlanCode = (typeof PLAN_CODES)[number];

export const USER_ROLES = ['OWNER', 'MEMBER'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const APPOINTMENT_STATUSES = [
  'PENDING_PAYMENT',
  'SCHEDULED',
  'CONFIRMED',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

/** Inclui REFUNDED (Prisma Fase 4) — evita drift FE sem o valor. */
export const PIX_CHARGE_STATUSES = [
  'PENDING',
  'PAID',
  'EXPIRED',
  'CANCELLED',
  'REFUNDED',
] as const;
export type PixChargeStatus = (typeof PIX_CHARGE_STATUSES)[number];

export const WAITLIST_STATUSES = ['WAITING', 'NOTIFIED', 'BOOKED', 'EXPIRED'] as const;
export type WaitlistStatus = (typeof WAITLIST_STATUSES)[number];

/** Subconjunto tipicamente listado na UI de waitlist aberta. */
export type WaitlistEntryStatus = Extract<WaitlistStatus, 'WAITING' | 'NOTIFIED'>;

export const SUBSCRIPTION_STATUSES = [
  'TRIALING',
  'ACTIVE',
  'PAST_DUE',
  'CANCELED',
  'INCOMPLETE',
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];
