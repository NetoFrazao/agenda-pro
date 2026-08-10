import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AppointmentStatus, PixChargeStatus } from '@prisma/client';
import { AppointmentsService } from './appointments.service';
import { generateManageToken, hashToken } from '../common/crypto/tokens';

function baseDeps(overrides?: {
  prisma?: Record<string, unknown>;
  notifications?: Record<string, unknown>;
  cache?: Record<string, unknown>;
  loyalty?: Record<string, unknown>;
}) {
  const notifications = {
    cancelPendingForAppointment: jest.fn().mockResolvedValue(1),
    enqueueBookingCancelled: jest.fn().mockResolvedValue(undefined),
    enqueueBookingConfirmation: jest.fn().mockResolvedValue(undefined),
    ...overrides?.notifications,
  };
  const cache = {
    invalidatePublicSlots: jest.fn().mockResolvedValue(undefined),
    invalidatePublicProfile: jest.fn().mockResolvedValue(undefined),
    ...overrides?.cache,
  };
  const loyalty = {
    creditForCompletedAppointment: jest.fn().mockResolvedValue(undefined),
    ...overrides?.loyalty,
  };
  return {
    notifications,
    cache,
    loyalty,
    prisma: overrides?.prisma ?? {},
  };
}

describe('AppointmentsService — orquestração notifications / FSM', () => {
  it('cancelByToken bloqueia quando dentro do prazo cancelMinHours', async () => {
    const raw = generateManageToken();
    const hashed = hashToken(raw);
    const appointment = {
      id: 'a-deadline',
      tenantId: 't1',
      status: AppointmentStatus.SCHEDULED,
      manageToken: hashed,
      startsAt: new Date(Date.now() + 30 * 60_000), // 30min — abaixo de 2h
      tenant: { cancelMinHours: 2, slug: 'x' },
      client: { name: 'A', phone: '1199', email: null },
      service: { id: 's', name: 'Corte', durationMinutes: 30, priceCents: 5000 },
      professional: { id: 'p', name: 'Pro' },
      review: null,
      pixCharge: null,
    };

    const update = jest.fn();
    const { notifications, cache, loyalty } = baseDeps();
    const service = new AppointmentsService(
      {
        appointment: {
          findUnique: jest.fn().mockResolvedValue(appointment),
          update,
        },
      } as never,
      notifications as never,
      { isConfigured: false } as never,
      { appPublicUrl: 'http://localhost:3000' } as never,
      loyalty as never,
      cache as never,
    );

    await expect(service.cancelByToken(raw)).rejects.toBeInstanceOf(BadRequestException);
    expect(update).not.toHaveBeenCalled();
    expect(notifications.cancelPendingForAppointment).not.toHaveBeenCalled();
    expect(notifications.enqueueBookingCancelled).not.toHaveBeenCalled();
  });

  it('cancelByToken cancela e orquestra notifications + waitlist/cache', async () => {
    const raw = generateManageToken();
    const hashed = hashToken(raw);
    const startsAt = new Date(Date.now() + 7 * 86_400_000);
    const appointment = {
      id: 'a-ok',
      tenantId: 't1',
      status: AppointmentStatus.CONFIRMED,
      manageToken: hashed,
      startsAt,
      tenant: { cancelMinHours: 2, slug: 'barber' },
      client: { name: 'A', phone: '1199', email: null },
      service: { id: 's', name: 'Corte', durationMinutes: 30, priceCents: 5000 },
      professional: { id: 'p', name: 'Pro' },
      review: null,
      pixCharge: null,
    };

    const update = jest.fn().mockResolvedValue({});
    const findUniqueTenant = jest.fn().mockResolvedValue({
      id: 't1',
      slug: 'barber',
      timezone: 'America/Sao_Paulo',
      plan: 'PRO',
    });
    const { notifications, cache, loyalty } = baseDeps();
    const service = new AppointmentsService(
      {
        appointment: {
          findUnique: jest.fn().mockResolvedValue(appointment),
          update,
        },
        tenant: { findUnique: findUniqueTenant },
        waitlistEntry: {
          findFirst: jest.fn().mockResolvedValue(null),
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        },
        $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
          fn({
            waitlistEntry: {
              findFirst: jest.fn().mockResolvedValue(null),
              updateMany: jest.fn().mockResolvedValue({ count: 0 }),
            },
          }),
        ),
      } as never,
      notifications as never,
      { isConfigured: false } as never,
      { appPublicUrl: 'http://localhost:3000' } as never,
      loyalty as never,
      cache as never,
    );

    await expect(service.cancelByToken(raw, 'mudou de ideia')).resolves.toEqual({ ok: true });
    expect(update).toHaveBeenCalledWith({
      where: { id: 'a-ok' },
      data: expect.objectContaining({
        status: AppointmentStatus.CANCELLED,
        cancelReason: 'mudou de ideia',
      }),
    });
    expect(notifications.cancelPendingForAppointment).toHaveBeenCalledWith('a-ok');
    expect(notifications.enqueueBookingCancelled).toHaveBeenCalledWith('a-ok', 'client');
    expect(cache.invalidatePublicSlots).toHaveBeenCalledWith('barber');
    expect(notifications.cancelPendingForAppointment.mock.invocationCallOrder[0]).toBeLessThan(
      notifications.enqueueBookingCancelled.mock.invocationCallOrder[0],
    );
  });

  it('updateStatus CANCELLED orquestra cancelPending + enqueue cancelled + cache', async () => {
    const findFirst = jest.fn().mockResolvedValue({
      id: 'a1',
      tenantId: 't1',
      clientId: 'c1',
      serviceId: 's1',
      status: AppointmentStatus.SCHEDULED,
      priceCentsSnapshot: 5000,
      cancelledAt: null,
      startsAt: new Date(Date.now() + 86_400_000),
      tenant: {
        name: 'Barbearia X',
        loyaltyPointsPerReal: 1,
        loyaltyEnabled: false,
        slug: 'x',
        timezone: 'America/Sao_Paulo',
        plan: 'PRO',
      },
      service: { id: 's', name: 'Corte', durationMinutes: 30 },
      pixCharge: null,
    });
    const row = { id: 'a1', status: AppointmentStatus.CANCELLED };
    const { notifications, cache, loyalty } = baseDeps();
    const service = new AppointmentsService(
      {
        appointment: { findFirst },
        waitlistEntry: {
          findFirst: jest.fn().mockResolvedValue(null),
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        },
        $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
          fn({
            appointment: {
              update: jest.fn().mockResolvedValue(row),
            },
            waitlistEntry: {
              findFirst: jest.fn().mockResolvedValue(null),
              updateMany: jest.fn().mockResolvedValue({ count: 0 }),
            },
          }),
        ),
      } as never,
      notifications as never,
      {} as never,
      { appPublicUrl: 'http://localhost:3000' } as never,
      loyalty as never,
      cache as never,
    );

    await expect(service.updateStatus('t1', 'a1', AppointmentStatus.CANCELLED)).resolves.toMatchObject(
      {
        id: 'a1',
        rebookingSuggested: false,
      },
    );
    expect(notifications.cancelPendingForAppointment).toHaveBeenCalledWith('a1');
    expect(notifications.enqueueBookingCancelled).toHaveBeenCalledWith('a1', 'professional');
    expect(cache.invalidatePublicSlots).toHaveBeenCalledWith('x');
  });

  it('updateStatus COMPLETED credita loyalty e sugere remarcação sem upcoming', async () => {
    const findFirst = jest
      .fn()
      .mockResolvedValueOnce({
        id: 'a1',
        tenantId: 't1',
        clientId: 'c1',
        serviceId: 's1',
        status: AppointmentStatus.CONFIRMED,
        priceCentsSnapshot: 5000,
        cancelledAt: null,
        startsAt: new Date(Date.now() - 3_600_000),
        tenant: {
          loyaltyPointsPerReal: 1,
          loyaltyEnabled: true,
          slug: 'x',
        },
        service: { id: 's1', name: 'Corte', durationMinutes: 30 },
        pixCharge: null,
      })
      // hasUpcoming probe
      .mockResolvedValueOnce(null);

    const row = { id: 'a1', status: AppointmentStatus.COMPLETED };
    const credit = jest.fn().mockResolvedValue(undefined);
    const { notifications, cache } = baseDeps({ loyalty: { creditForCompletedAppointment: credit } });
    const service = new AppointmentsService(
      {
        appointment: { findFirst },
        $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
          fn({
            appointment: { update: jest.fn().mockResolvedValue(row) },
          }),
        ),
      } as never,
      notifications as never,
      {} as never,
      { appPublicUrl: 'http://localhost:3000' } as never,
      { creditForCompletedAppointment: credit } as never,
      cache as never,
    );

    const result = await service.updateStatus('t1', 'a1', AppointmentStatus.COMPLETED);
    expect(credit).toHaveBeenCalled();
    expect(result.rebookingSuggested).toBe(true);
    expect(result.rebooking).toMatchObject({
      clientId: 'c1',
      serviceId: 's1',
      suggestedAfterDays: 30,
    });
  });

  it('updateStatus 404 quando appointment não pertence ao tenant', async () => {
    const { notifications, cache, loyalty } = baseDeps();
    const service = new AppointmentsService(
      { appointment: { findFirst: jest.fn().mockResolvedValue(null) } } as never,
      notifications as never,
      {} as never,
      { appPublicUrl: 'http://localhost:3000' } as never,
      loyalty as never,
      cache as never,
    );
    await expect(
      service.updateStatus('t1', 'missing', AppointmentStatus.CANCELLED),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('list retorna PageResult com paginação', async () => {
    const items = [{ id: 'a1' }, { id: 'a2' }];
    const findMany = jest.fn().mockResolvedValue(items);
    const count = jest.fn().mockResolvedValue(2);
    const { notifications, cache, loyalty } = baseDeps();
    const service = new AppointmentsService(
      { appointment: { findMany, count } } as never,
      notifications as never,
      {} as never,
      { appPublicUrl: 'http://localhost:3000' } as never,
      loyalty as never,
      cache as never,
    );

    const page = await service.list('t1', { page: 1, pageSize: 50 });
    expect(page).toEqual({
      items,
      total: 2,
      page: 1,
      pageSize: 50,
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: 't1' },
      }),
    );
  });

  it('confirmByToken é no-op idempotente se já CONFIRMED', async () => {
    const raw = generateManageToken();
    const update = jest.fn();
    const { notifications, cache, loyalty } = baseDeps();
    const service = new AppointmentsService(
      {
        appointment: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'a1',
            status: AppointmentStatus.CONFIRMED,
            manageToken: hashToken(raw),
            pixCharge: null,
            startsAt: new Date(Date.now() + 86_400_000),
            tenant: { cancelMinHours: 2 },
            client: { name: 'A', phone: '1199', email: null },
            service: { id: 's', name: 'Corte', durationMinutes: 30, priceCents: 5000 },
            professional: { id: 'p', name: 'Pro' },
            review: null,
          }),
          update,
        },
      } as never,
      notifications as never,
      {} as never,
      { appPublicUrl: 'http://localhost:3000' } as never,
      loyalty as never,
      cache as never,
    );

    await expect(service.confirmByToken(raw)).resolves.toEqual({
      ok: true,
      status: AppointmentStatus.CONFIRMED,
    });
    expect(update).not.toHaveBeenCalled();
  });

  it('getByManageToken mascara telefone do cliente', async () => {
    const raw = generateManageToken();
    const hashed = hashToken(raw);
    const { notifications, cache, loyalty } = baseDeps();
    const service = new AppointmentsService(
      {
        appointment: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'a1',
            status: AppointmentStatus.SCHEDULED,
            manageToken: hashed,
            startsAt: new Date(Date.now() + 86_400_000),
            endsAt: new Date(Date.now() + 86_400_000 + 30 * 60_000),
            priceCentsSnapshot: 5000,
            durationMinutesSnapshot: 30,
            pixCharge: { status: PixChargeStatus.PENDING },
            tenant: {
              slug: 'x',
              name: 'X',
              timezone: 'America/Sao_Paulo',
              address: null,
              whatsapp: null,
              cancelMinHours: 2,
            },
            client: { name: 'Maria', phone: '11987654321', email: 'maria@example.com' },
            service: { id: 's', name: 'Corte', durationMinutes: 30, priceCents: 5000 },
            professional: { id: 'p', name: 'Pro' },
            review: null,
          }),
        },
      } as never,
      notifications as never,
      {} as never,
      { appPublicUrl: 'http://localhost:3000' } as never,
      loyalty as never,
      cache as never,
    );

    const detail = await service.getByManageToken(raw);
    expect(detail.client.phone).toBe('****4321');
    expect(detail.client.email).toBe('ma***@example.com');
    expect(detail).not.toHaveProperty('manageToken');
    expect(detail.canCancel).toBe(true);
  });
});
