import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  UpdateBookingSettingsDto,
  UpdateLoyaltySettingsDto,
  UpdateProfileSettingsDto,
} from './dto/settings.dto';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

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
    await this.prisma.tenant.update({ where: { id: tenantId }, data: dto });
    return this.get(tenantId);
  }

  async updateBooking(tenantId: string, dto: UpdateBookingSettingsDto) {
    await this.prisma.tenant.update({ where: { id: tenantId }, data: dto });
    return this.get(tenantId);
  }

  async updateLoyalty(tenantId: string, dto: UpdateLoyaltySettingsDto) {
    await this.prisma.tenant.update({ where: { id: tenantId }, data: dto });
    return this.get(tenantId);
  }
}
