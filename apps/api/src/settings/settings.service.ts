import { Injectable } from '@nestjs/common';
import { RedisCacheService } from '../common/cache/redis-cache.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  UpdateBookingSettingsDto,
  UpdateLoyaltySettingsDto,
  UpdateProfileSettingsDto,
} from './dto/settings.dto';

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: RedisCacheService,
  ) {}

  get(tenantId: string) {
    return this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: {
        id: true,
        slug: true,
        name: true,
        timezone: true,
        plan: true,
        about: true,
        address: true,
        whatsapp: true,
        minNoticeMinutes: true,
        maxAdvanceDays: true,
        bufferMinutes: true,
        slotGridMinutes: true,
        cancelMinHours: true,
        loyaltyEnabled: true,
        loyaltyPointsPerReal: true,
      },
    });
  }

  async updateProfile(tenantId: string, dto: UpdateProfileSettingsDto) {
    const updated = await this.prisma.tenant.update({
      where: { id: tenantId },
      data: dto,
      select: { slug: true },
    });
    await this.cache.invalidatePublicProfile(updated.slug);
    await this.cache.invalidatePublicSlots(updated.slug);
    return this.get(tenantId);
  }

  async updateBooking(tenantId: string, dto: UpdateBookingSettingsDto) {
    const updated = await this.prisma.tenant.update({
      where: { id: tenantId },
      data: dto,
      select: { slug: true },
    });
    await this.cache.invalidatePublicProfile(updated.slug);
    await this.cache.invalidatePublicSlots(updated.slug);
    return this.get(tenantId);
  }

  async updateLoyalty(tenantId: string, dto: UpdateLoyaltySettingsDto) {
    await this.prisma.tenant.update({ where: { id: tenantId }, data: dto });
    // Loyalty não entra no perfil público — sem invalidar
    return this.get(tenantId);
  }
}
