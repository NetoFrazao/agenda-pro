import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAvailabilityRuleDto } from './dto/availability.dto';

@Injectable()
export class AvailabilityService {
  constructor(private readonly prisma: PrismaService) {}

  listRules(tenantId: string) {
    return this.prisma.availabilityRule.findMany({
      where: { tenantId, isActive: true },
      orderBy: [{ dayOfWeek: 'asc' }, { startMinute: 'asc' }],
    });
  }

  async createRule(tenantId: string, userId: string, dto: CreateAvailabilityRuleDto) {
    if (dto.endMinute <= dto.startMinute) {
      throw new BadRequestException('endMinute deve ser maior que startMinute');
    }
    return this.prisma.availabilityRule.create({
      data: {
        tenantId,
        professionalId: dto.professionalId ?? userId,
        dayOfWeek: dto.dayOfWeek,
        startMinute: dto.startMinute,
        endMinute: dto.endMinute,
      },
    });
  }

  async deleteRule(tenantId: string, id: string) {
    const rule = await this.prisma.availabilityRule.findFirst({
      where: { id, tenantId },
    });
    if (!rule) {
      throw new NotFoundException('Regra não encontrada');
    }
    await this.prisma.availabilityRule.delete({ where: { id } });
    return { ok: true };
  }
}
