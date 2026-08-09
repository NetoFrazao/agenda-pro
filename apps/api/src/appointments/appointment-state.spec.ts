import { BadRequestException } from '@nestjs/common';
import { AppointmentStatus } from '@prisma/client';
import {
  assertValidTransition,
  canTransition,
  isCancellableStatus,
  allowedTransitions,
} from './appointment-state';

describe('appointment-state (M-03)', () => {
  it('PENDING_PAYMENT → CONFIRMED | SCHEDULED | CANCELLED', () => {
    expect(allowedTransitions(AppointmentStatus.PENDING_PAYMENT)).toEqual(
      expect.arrayContaining([
        AppointmentStatus.CONFIRMED,
        AppointmentStatus.SCHEDULED,
        AppointmentStatus.CANCELLED,
      ]),
    );
    expect(canTransition(AppointmentStatus.PENDING_PAYMENT, AppointmentStatus.COMPLETED)).toBe(
      false,
    );
  });

  it('SCHEDULED → CONFIRMED | CANCELLED | NO_SHOW | COMPLETED', () => {
    for (const to of [
      AppointmentStatus.CONFIRMED,
      AppointmentStatus.CANCELLED,
      AppointmentStatus.NO_SHOW,
      AppointmentStatus.COMPLETED,
    ]) {
      expect(canTransition(AppointmentStatus.SCHEDULED, to)).toBe(true);
    }
  });

  it('CONFIRMED pode remarcar para SCHEDULED', () => {
    expect(canTransition(AppointmentStatus.CONFIRMED, AppointmentStatus.SCHEDULED)).toBe(true);
  });

  it('estados terminais não permitem saída', () => {
    for (const terminal of [
      AppointmentStatus.COMPLETED,
      AppointmentStatus.CANCELLED,
      AppointmentStatus.NO_SHOW,
    ]) {
      expect(allowedTransitions(terminal)).toEqual([]);
      expect(canTransition(terminal, AppointmentStatus.SCHEDULED)).toBe(false);
    }
  });

  it('mesma status é no-op permitido', () => {
    expect(canTransition(AppointmentStatus.SCHEDULED, AppointmentStatus.SCHEDULED)).toBe(true);
    expect(() =>
      assertValidTransition(AppointmentStatus.CANCELLED, AppointmentStatus.CANCELLED),
    ).not.toThrow();
  });

  it('assertValidTransition lança BadRequest em transição ilegal', () => {
    expect(() =>
      assertValidTransition(AppointmentStatus.CANCELLED, AppointmentStatus.COMPLETED),
    ).toThrow(BadRequestException);
    expect(() =>
      assertValidTransition(AppointmentStatus.PENDING_PAYMENT, AppointmentStatus.NO_SHOW),
    ).toThrow(/PENDING_PAYMENT/);
  });

  it('isCancellableStatus cobre ativos', () => {
    expect(isCancellableStatus(AppointmentStatus.PENDING_PAYMENT)).toBe(true);
    expect(isCancellableStatus(AppointmentStatus.SCHEDULED)).toBe(true);
    expect(isCancellableStatus(AppointmentStatus.CONFIRMED)).toBe(true);
    expect(isCancellableStatus(AppointmentStatus.COMPLETED)).toBe(false);
    expect(isCancellableStatus(AppointmentStatus.CANCELLED)).toBe(false);
  });
});
