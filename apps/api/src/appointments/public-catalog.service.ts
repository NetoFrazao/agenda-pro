import { Injectable, NotFoundException } from '@nestjs/common';
import { toDateKey } from '../common/availability/availability.engine';
import {
  PUBLIC_PROFILE_TTL_SECONDS,
  PUBLIC_SLOTS_TTL_SECONDS,
  RedisCacheService,
} from '../common/cache/redis-cache.service';
import { PrismaService } from '../prisma/prisma.service';
import { AppointmentAvailabilityService } from './appointment-availability.service';

@Injectable()
export class PublicCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: RedisCacheService,
    private readonly availability: AppointmentAvailabilityService,
  ) {}

  async getPublicProfile(slug: string) {
    const cacheKey = this.cache.publicProfileKey(slug);
    const cached =
      await this.cache.getJson<Awaited<ReturnType<PublicCatalogService['loadPublicProfile']>>>(
        cacheKey,
      );
    if (cached) return cached;

    const profile = await this.loadPublicProfile(slug);
    await this.cache.setJson(cacheKey, profile, PUBLIC_PROFILE_TTL_SECONDS);
    return profile;
  }

  private async loadPublicProfile(slug: string) {
    const tenant = await this.prisma.tenant.findFirst({
      where: { slug, deletedAt: null },
      select: {
        id: true,
        slug: true,
        name: true,
        timezone: true,
        about: true,
        address: true,
        whatsapp: true,
        maxAdvanceDays: true,
        services: {
          where: { isActive: true, deletedAt: null },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          select: {
            id: true,
            name: true,
            description: true,
            durationMinutes: true,
            priceCents: true,
            depositCents: true,
          },
        },
        users: {
          where: { isActive: true, deletedAt: null },
          orderBy: { createdAt: 'asc' },
          select: { id: true, name: true, role: true },
        },
      },
    });
    if (!tenant) throw new NotFoundException('Profissional não encontrado');

    const [ratingAgg, recentReviews] = await Promise.all([
      this.prisma.review.aggregate({
        where: { tenantId: tenant.id, isPublished: true },
        _avg: { rating: true },
        _count: true,
      }),
      this.prisma.review.findMany({
        where: { tenantId: tenant.id, isPublished: true },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { rating: true, comment: true, clientName: true, createdAt: true },
      }),
    ]);

    const { users, ...rest } = tenant;
    return {
      ...rest,
      professionals: users,
      rating: {
        average: ratingAgg._avg.rating ? Number(ratingAgg._avg.rating.toFixed(1)) : null,
        count: ratingAgg._count,
      },
      reviews: recentReviews,
    };
  }

  /** Invalida cache do perfil público (settings/services/team/reviews). */
  async invalidatePublicProfileCache(tenantIdOrSlug: { tenantId?: string; slug?: string }) {
    if (tenantIdOrSlug.slug) {
      await this.cache.invalidatePublicProfile(tenantIdOrSlug.slug);
      await this.cache.invalidatePublicSlots(tenantIdOrSlug.slug);
      return;
    }
    if (tenantIdOrSlug.tenantId) {
      await this.cache.invalidatePublicProfileByTenantId(tenantIdOrSlug.tenantId, async (id) => {
        const t = await this.prisma.tenant.findUnique({
          where: { id },
          select: { slug: true },
        });
        return t?.slug ?? null;
      });
    }
  }

  async getPublicSlots(slug: string, serviceId: string, dateKey: string, professionalId?: string) {
    const cacheKey = this.cache.publicSlotsKey(slug, serviceId, dateKey, professionalId);
    const cached = await this.cache.getJson<{
      date: string;
      timezone: string;
      serviceId: string;
      professionalId: string;
      slots: string[];
    }>(cacheKey);
    if (cached) return cached;

    const tenant = await this.prisma.tenant.findFirst({
      where: { slug, deletedAt: null },
    });
    if (!tenant) throw new NotFoundException('Profissional não encontrado');

    const service = await this.prisma.service.findFirst({
      where: { id: serviceId, tenantId: tenant.id, isActive: true, deletedAt: null },
    });
    if (!service) throw new NotFoundException('Serviço não encontrado');

    const professional = await this.availability.resolveProfessional(tenant.id, professionalId);

    // Janela máxima de agendamento futuro (regra do estabelecimento)
    const maxDate = new Date(Date.now() + tenant.maxAdvanceDays * 86_400_000);
    if (dateKey > toDateKey(maxDate, tenant.timezone)) {
      const empty = {
        date: dateKey,
        timezone: tenant.timezone,
        serviceId: service.id,
        professionalId: professional.id,
        slots: [] as string[],
      };
      await this.cache.setJson(cacheKey, empty, PUBLIC_SLOTS_TTL_SECONDS);
      return empty;
    }

    const slots = await this.availability.computeSlotsFor(
      tenant,
      professional,
      service.durationMinutes,
      dateKey,
    );

    const result = {
      date: dateKey,
      timezone: tenant.timezone,
      serviceId: service.id,
      professionalId: professional.id,
      slots: slots.map((s) => s.toISOString()),
    };
    await this.cache.setJson(cacheKey, result, PUBLIC_SLOTS_TTL_SECONDS);
    return result;
  }
}
