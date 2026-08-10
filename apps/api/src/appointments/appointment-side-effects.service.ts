import { Injectable } from '@nestjs/common';
import type { Tenant } from '@prisma/client';
import { RedisCacheService } from '../common/cache/redis-cache.service';
import { notifyNextWaitlistCandidate } from '../common/waitlist/notify-next';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Efeitos colaterais pós-mutação de agenda: notificações, waitlist e cache público.
 */
@Injectable()
export class AppointmentSideEffectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly cache: RedisCacheService,
  ) {}

  async onCancelled(params: {
    appointmentId: string;
    tenantId: string;
    startsAt: Date;
    cancelledBy: 'client' | 'professional';
    tenant?: Tenant | null;
    slug?: string;
  }) {
    await this.notifications.cancelPendingForAppointment(params.appointmentId);
    await this.notifications.enqueueBookingCancelled(params.appointmentId, params.cancelledBy);

    const tenant =
      params.tenant ?? (await this.prisma.tenant.findUnique({ where: { id: params.tenantId } }));
    if (tenant) {
      await notifyNextWaitlistCandidate(
        this.prisma,
        this.notifications,
        params.tenantId,
        params.startsAt,
        tenant,
      );
      await this.cache.invalidatePublicSlots(params.slug ?? tenant.slug);
    }
  }

  async onRescheduled(params: {
    appointmentId: string;
    tenantId: string;
    previousStartsAt: Date;
    manageTokenRaw: string;
    tenant: Tenant;
  }) {
    await this.notifications.cancelPendingForAppointment(params.appointmentId);
    await notifyNextWaitlistCandidate(
      this.prisma,
      this.notifications,
      params.tenantId,
      params.previousStartsAt,
      params.tenant,
    );
    await this.notifications.enqueueBookingConfirmation(
      params.appointmentId,
      params.manageTokenRaw,
    );
    await this.cache.invalidatePublicSlots(params.tenant.slug);
  }

  async invalidateSlots(slug: string) {
    await this.cache.invalidatePublicSlots(slug);
  }

  async invalidateProfile(slug: string) {
    await this.cache.invalidatePublicProfile(slug);
  }
}
