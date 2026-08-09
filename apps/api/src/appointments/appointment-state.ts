import { BadRequestException } from '@nestjs/common';
import { AppointmentStatus } from '@prisma/client';

/**
 * Máquina de estados de Appointment (M-03).
 * Transições inválidas (ex.: CANCELLED→COMPLETED) distorcem loyalty e relatórios.
 */
/**
 * PENDING_PAYMENT → CONFIRMED só via PixLifecycleService.confirmPaid (fora da FSM).
 * Cliente/staff não podem furar o sinal com confirmByToken / updateStatus.
 */
const TRANSITIONS: Record<AppointmentStatus, readonly AppointmentStatus[]> = {
  [AppointmentStatus.PENDING_PAYMENT]: [AppointmentStatus.CANCELLED],
  [AppointmentStatus.SCHEDULED]: [
    AppointmentStatus.CONFIRMED,
    AppointmentStatus.CANCELLED,
    AppointmentStatus.NO_SHOW,
    AppointmentStatus.COMPLETED,
  ],
  [AppointmentStatus.CONFIRMED]: [
    AppointmentStatus.SCHEDULED, // remarcação volta a SCHEDULED
    AppointmentStatus.COMPLETED,
    AppointmentStatus.CANCELLED,
    AppointmentStatus.NO_SHOW,
  ],
  [AppointmentStatus.COMPLETED]: [],
  [AppointmentStatus.CANCELLED]: [],
  [AppointmentStatus.NO_SHOW]: [],
};

export function allowedTransitions(from: AppointmentStatus): readonly AppointmentStatus[] {
  return TRANSITIONS[from] ?? [];
}

export function canTransition(from: AppointmentStatus, to: AppointmentStatus): boolean {
  if (from === to) return true;
  return allowedTransitions(from).includes(to);
}

export function assertValidTransition(from: AppointmentStatus, to: AppointmentStatus): void {
  if (canTransition(from, to)) return;
  throw new BadRequestException(
    `Transição de status inválida: ${from} → ${to}. Permitidas: ${
      allowedTransitions(from).join(', ') || '(nenhuma — estado terminal)'
    }`,
  );
}

/** Status em que o cliente ainda pode cancelar/remarcar (sujeito a cancelMinHours). */
export function isCancellableStatus(status: AppointmentStatus): boolean {
  return (
    status === AppointmentStatus.PENDING_PAYMENT ||
    status === AppointmentStatus.SCHEDULED ||
    status === AppointmentStatus.CONFIRMED
  );
}
