import { BadRequestException, ConflictException } from '@nestjs/common';
import { AppointmentStatus, PixChargeStatus, SubscriptionStatus } from '@prisma/client';
import { createAppointmentsTestFacade } from './appointments-test.util';
import { generateManageToken, hashToken } from '../common/crypto/tokens';

describe('AppointmentsService — PIX confirm + manageToken', () => {
  function buildService(appointment: Record<string, unknown>) {
    const update = jest.fn().mockResolvedValue({});
    const findUnique = jest
      .fn()
      .mockImplementation(async ({ where }: { where: { manageToken: string } }) => {
        const stored = appointment.manageToken as string;
        if (where.manageToken === stored) return appointment;
        return null;
      });
    const prisma = {
      appointment: { findUnique, update },
    };
    const { service } = createAppointmentsTestFacade({
      prisma,
      notifications: { enqueueBookingConfirmation: jest.fn() },
      mercadoPago: { isConfigured: false },
      cache: { invalidatePublicProfile: jest.fn(), invalidatePublicSlots: jest.fn() },
    });
    return { service, update, findUnique };
  }

  it('confirmByToken rejeita PENDING_PAYMENT sem PixCharge PAID', async () => {
    const raw = generateManageToken();
    const { service, update } = buildService({
      id: 'a1',
      status: AppointmentStatus.PENDING_PAYMENT,
      manageToken: hashToken(raw),
      pixCharge: { status: PixChargeStatus.PENDING },
      startsAt: new Date(Date.now() + 86_400_000),
      tenant: { cancelMinHours: 2 },
      client: { name: 'A', phone: '1199', email: null },
      service: { id: 's', name: 'Corte', durationMinutes: 30, priceCents: 5000 },
      professional: { id: 'p', name: 'Pro' },
      review: null,
    });

    await expect(service.confirmByToken(raw)).rejects.toBeInstanceOf(BadRequestException);
    expect(update).not.toHaveBeenCalled();
  });

  it('confirmByToken permite SCHEDULED → CONFIRMED', async () => {
    const raw = generateManageToken();
    const { service, update } = buildService({
      id: 'a2',
      status: AppointmentStatus.SCHEDULED,
      manageToken: hashToken(raw),
      pixCharge: null,
      startsAt: new Date(Date.now() + 86_400_000),
      tenant: { cancelMinHours: 2 },
      client: { name: 'A', phone: '1199', email: null },
      service: { id: 's', name: 'Corte', durationMinutes: 30, priceCents: 5000 },
      professional: { id: 'p', name: 'Pro' },
      review: null,
    });

    await expect(service.confirmByToken(raw)).resolves.toEqual({
      ok: true,
      status: AppointmentStatus.CONFIRMED,
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: 'a2' },
      data: { status: AppointmentStatus.CONFIRMED },
    });
  });

  it('findByManageToken resolve hash e legado plaintext', async () => {
    const raw = generateManageToken();
    const hashed = hashToken(raw);
    const findUnique = jest
      .fn()
      .mockResolvedValueOnce(null) // hash miss on first legacy probe path — we'll drive getByManageToken
      .mockResolvedValueOnce({
        id: 'legacy',
        status: AppointmentStatus.SCHEDULED,
        manageToken: 'cllegacytoken000000000001',
        pixCharge: null,
        startsAt: new Date(Date.now() + 86_400_000),
        endsAt: new Date(Date.now() + 86_400_000 + 30 * 60_000),
        priceCentsSnapshot: 5000,
        durationMinutesSnapshot: 30,
        tenant: {
          slug: 'x',
          name: 'X',
          timezone: 'America/Sao_Paulo',
          address: null,
          whatsapp: null,
          cancelMinHours: 2,
        },
        client: { name: 'A', phone: '11999990000', email: null },
        service: { id: 's', name: 'Corte', durationMinutes: 30, priceCents: 5000 },
        professional: { id: 'p', name: 'Pro' },
        review: null,
      });

    // Path A: hashed token
    const findHash = jest
      .fn()
      .mockImplementation(async ({ where }: { where: { manageToken: string } }) => {
        if (where.manageToken === hashed) {
          return {
            id: 'hashed',
            status: AppointmentStatus.SCHEDULED,
            manageToken: hashed,
            pixCharge: null,
            startsAt: new Date(Date.now() + 86_400_000),
            endsAt: new Date(Date.now() + 86_400_000 + 30 * 60_000),
            priceCentsSnapshot: 5000,
            durationMinutesSnapshot: 30,
            tenant: {
              slug: 'x',
              name: 'X',
              timezone: 'America/Sao_Paulo',
              address: null,
              whatsapp: null,
              cancelMinHours: 2,
            },
            client: { name: 'A', phone: '11999990000', email: null },
            service: { id: 's', name: 'Corte', durationMinutes: 30, priceCents: 5000 },
            professional: { id: 'p', name: 'Pro' },
            review: null,
          };
        }
        return null;
      });

    const { service: serviceHash } = createAppointmentsTestFacade({
      prisma: { appointment: { findUnique: findHash, update: jest.fn() } },
    });
    const byHash = await serviceHash.getByManageToken(raw);
    expect(byHash.id).toBe('hashed');
    expect(byHash).not.toHaveProperty('manageToken');

    const { service: serviceLegacy } = createAppointmentsTestFacade({
      prisma: { appointment: { findUnique, update: jest.fn() } },
    });
    const byLegacy = await serviceLegacy.getByManageToken('cllegacytoken000000000001');
    expect(byLegacy.id).toBe('legacy');
  });
});

describe('AppointmentsService — updateStatus PIX gate + PAST_DUE book', () => {
  it('updateStatus bloqueia PENDING_PAYMENT → CONFIRMED sem PixCharge PAID', async () => {
    const findFirst = jest.fn().mockResolvedValue({
      id: 'a1',
      tenantId: 't1',
      status: AppointmentStatus.PENDING_PAYMENT,
      clientId: 'c1',
      priceCentsSnapshot: 5000,
      cancelledAt: null,
      startsAt: new Date(Date.now() + 86_400_000),
      tenant: { loyaltyPointsPerReal: 1, loyaltyEnabled: false, slug: 'x' },
      service: { id: 's', name: 'Corte', durationMinutes: 30 },
      pixCharge: { status: PixChargeStatus.PENDING },
    });
    const update = jest.fn();
    const cancelPending = jest.fn();
    const { service } = createAppointmentsTestFacade({
      prisma: { appointment: { findFirst, update }, $transaction: jest.fn() },
      notifications: { cancelPendingForAppointment: cancelPending },
    });

    await expect(
      service.updateStatus('t1', 'a1', AppointmentStatus.CONFIRMED),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(update).not.toHaveBeenCalled();
  });

  it('bookPublic rejeita tenant com subscription PAST_DUE', async () => {
    const { service } = createAppointmentsTestFacade({
      prisma: {
        tenant: {
          findFirst: jest.fn().mockResolvedValue({
            id: 't1',
            slug: 'barber',
            plan: 'PRO',
            subscription: { status: SubscriptionStatus.PAST_DUE, monthlyBookingLimit: null },
          }),
        },
        service: { findFirst: jest.fn() },
      },
      mercadoPago: { isConfigured: false },
    });

    await expect(
      service.bookPublic('barber', {
        serviceId: 's1',
        startsAt: new Date(Date.now() + 86_400_000).toISOString(),
        clientName: 'João',
        clientPhone: '11999990000',
      } as never),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rescheduleByToken invalida NotificationJobs PENDING antes de reenfileirar', async () => {
    const raw = generateManageToken();
    const hashed = hashToken(raw);
    const startsAt = new Date(Date.now() + 7 * 86_400_000);
    const appointment = {
      id: 'a-rs',
      tenantId: 't1',
      status: AppointmentStatus.SCHEDULED,
      manageToken: hashed,
      startsAt,
      durationMinutesSnapshot: 30,
      professional: { id: 'p1', name: 'Pro' },
      tenant: { cancelMinHours: 2 },
    };

    const cancelPending = jest.fn().mockResolvedValue(2);
    const enqueueConfirmation = jest.fn().mockResolvedValue(undefined);
    const findUniqueAppt = jest.fn().mockResolvedValue(appointment);
    const findUniqueTenant = jest.fn().mockResolvedValue({
      id: 't1',
      slug: 'x',
      timezone: 'America/Sao_Paulo',
      cancelMinHours: 2,
      bufferMinutes: 0,
      slotGridMinutes: 30,
      minNoticeMinutes: 0,
      maxAdvanceDays: 60,
    });

    const { service, availability, manage } = createAppointmentsTestFacade({
      prisma: {
        appointment: {
          findUnique: findUniqueAppt,
          findMany: jest.fn().mockResolvedValue([]),
          update: jest.fn(),
        },
        tenant: { findUniqueOrThrow: findUniqueTenant },
        availabilityRule: { findMany: jest.fn().mockResolvedValue([]) },
        availabilityException: { findMany: jest.fn().mockResolvedValue([]) },
        $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
          fn({
            $executeRaw: jest.fn(),
            appointment: {
              findMany: jest.fn().mockResolvedValue([]),
              update: jest.fn(),
            },
            waitlistEntry: {
              findFirst: jest.fn().mockResolvedValue(null),
              updateMany: jest.fn().mockResolvedValue({ count: 0 }),
            },
          }),
        ),
        user: {
          findFirst: jest.fn().mockResolvedValue({ id: 'p1', name: 'Pro', isActive: true }),
        },
      },
      notifications: {
        cancelPendingForAppointment: cancelPending,
        enqueueBookingConfirmation: enqueueConfirmation,
      },
      cache: { invalidatePublicSlots: jest.fn() },
    });

    const newStarts = new Date(startsAt.getTime() + 3_600_000);
    jest.spyOn(availability, 'computeSlotsFor').mockResolvedValue([newStarts]);
    jest.spyOn(availability, 'assertWithinBookingWindow').mockImplementation(() => undefined);
    jest.spyOn(availability, 'resolveProfessional').mockResolvedValue({
      id: 'p1',
      name: 'Pro',
    } as never);
    jest.spyOn(manage, 'findByManageToken').mockResolvedValue(appointment as never);

    await expect(
      service.rescheduleByToken(raw, { startsAt: newStarts.toISOString() } as never),
    ).resolves.toMatchObject({ ok: true });

    expect(cancelPending).toHaveBeenCalledWith('a-rs');
    expect(enqueueConfirmation).toHaveBeenCalled();
    expect(cancelPending.mock.invocationCallOrder[0]).toBeLessThan(
      enqueueConfirmation.mock.invocationCallOrder[0],
    );
  });
});
