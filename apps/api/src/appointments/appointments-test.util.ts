import { AppointmentAvailabilityService } from './appointment-availability.service';
import { AppointmentLifecycleService } from './appointment-lifecycle.service';
import { AppointmentSideEffectsService } from './appointment-side-effects.service';
import { AppointmentsService } from './appointments.service';
import { BookingService } from './booking.service';
import { ManageAppointmentService } from './manage-appointment.service';
import { PublicCatalogService } from './public-catalog.service';

/** Monta a facade + serviços reais com deps mockáveis (unit tests). */
export function createAppointmentsTestFacade(deps: {
  prisma: unknown;
  notifications?: unknown;
  mercadoPago?: unknown;
  env?: unknown;
  loyalty?: unknown;
  cache?: unknown;
}) {
  const prisma = deps.prisma as never;
  const notifications = (deps.notifications ?? {}) as never;
  const mercadoPago = (deps.mercadoPago ?? { isConfigured: false }) as never;
  const env = (deps.env ?? { appPublicUrl: 'http://localhost:3000' }) as never;
  const loyalty = (deps.loyalty ?? {}) as never;
  const cache = (deps.cache ?? {}) as never;

  const availability = new AppointmentAvailabilityService(prisma);
  const sideEffects = new AppointmentSideEffectsService(prisma, notifications, cache);
  const lifecycle = new AppointmentLifecycleService(prisma, loyalty, sideEffects);
  const catalog = new PublicCatalogService(prisma, cache, availability);
  const booking = new BookingService(
    prisma,
    notifications,
    mercadoPago,
    env,
    availability,
    sideEffects,
  );
  const manage = new ManageAppointmentService(prisma, availability, sideEffects);
  const service = new AppointmentsService(lifecycle, catalog, booking, manage);

  return { service, availability, manage, booking, lifecycle, catalog, sideEffects };
}
