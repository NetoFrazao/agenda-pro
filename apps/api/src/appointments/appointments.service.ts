import { Injectable } from '@nestjs/common';
import type { AppointmentStatus } from '@prisma/client';
import { BookPublicDto, PublicReviewDto, RescheduleDto } from './dto/appointment.dto';
import { AppointmentLifecycleService } from './appointment-lifecycle.service';
import { PublicCatalogService } from './public-catalog.service';
import { BookingService } from './booking.service';
import { ManageAppointmentService } from './manage-appointment.service';

/**
 * Facade do domínio agenda — preserva a API pública usada por controllers/specs
 * e delega a serviços coesos (lifecycle, catálogo, booking/PIX, manage-token).
 */
@Injectable()
export class AppointmentsService {
  constructor(
    private readonly lifecycle: AppointmentLifecycleService,
    private readonly catalog: PublicCatalogService,
    private readonly booking: BookingService,
    private readonly manage: ManageAppointmentService,
  ) {}

  list(
    tenantId: string,
    opts: {
      from?: string;
      to?: string;
      professionalId?: string;
      activeOnly?: boolean;
      page?: number;
      pageSize?: number;
      actor?: { userId: string; role: string };
    } = {},
  ) {
    return this.lifecycle.list(tenantId, opts);
  }

  updateStatus(
    tenantId: string,
    id: string,
    status: AppointmentStatus,
    actor?: { userId: string; role: string },
  ) {
    return this.lifecycle.updateStatus(tenantId, id, status, actor);
  }

  getPublicProfile(slug: string) {
    return this.catalog.getPublicProfile(slug);
  }

  invalidatePublicProfileCache(tenantIdOrSlug: { tenantId?: string; slug?: string }) {
    return this.catalog.invalidatePublicProfileCache(tenantIdOrSlug);
  }

  getPublicSlots(slug: string, serviceId: string, dateKey: string, professionalId?: string) {
    return this.catalog.getPublicSlots(slug, serviceId, dateKey, professionalId);
  }

  bookPublic(slug: string, dto: BookPublicDto) {
    return this.booking.bookPublic(slug, dto);
  }

  getByManageToken(token: string) {
    return this.manage.getByManageToken(token);
  }

  confirmByToken(token: string) {
    return this.manage.confirmByToken(token);
  }

  cancelByToken(token: string, reason?: string) {
    return this.manage.cancelByToken(token, reason);
  }

  rescheduleByToken(token: string, dto: RescheduleDto) {
    return this.manage.rescheduleByToken(token, dto);
  }

  reviewByToken(token: string, dto: PublicReviewDto) {
    return this.manage.reviewByToken(token, dto);
  }
}
