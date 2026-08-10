/**
 * Contratos de domínio compartilhados com o web (`@agenda-pro/shared`).
 * Runtime de persistência continua em `@prisma/client`.
 */
export {
  APPOINTMENT_STATUSES,
  PIX_CHARGE_STATUSES,
  PLAN_CODES,
  USER_ROLES,
  WAITLIST_STATUSES,
  type AppointmentStatus as SharedAppointmentStatus,
  type PixChargeStatus as SharedPixChargeStatus,
} from '@agenda-pro/shared';
