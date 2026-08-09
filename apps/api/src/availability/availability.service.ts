import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { RedisCacheService } from '../common/cache/redis-cache.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAvailabilityExceptionDto, CreateAvailabilityRuleDto } from './dto/availability.dto';

@Injectable()
export class AvailabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: RedisCacheService,
  ) {}

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
    const professionalId = await this.resolveProfessionalId(tenantId, dto.professionalId, userId);
    const created = await this.prisma.availabilityRule.create({
      data: {
        tenantId,
        professionalId,
        dayOfWeek: dto.dayOfWeek,
        startMinute: dto.startMinute,
        endMinute: dto.endMinute,
      },
    });
    await this.invalidateSlots(tenantId);
    return created;
  }

  async deleteRule(tenantId: string, id: string) {
    const rule = await this.prisma.availabilityRule.findFirst({
      where: { id, tenantId },
    });
    if (!rule) {
      throw new NotFoundException('Regra não encontrada');
    }
    await this.prisma.availabilityRule.delete({ where: { id } });
    await this.invalidateSlots(tenantId);
    return { ok: true };
  }

  // ---- Exceções pontuais: folgas, feriados e janelas especiais ----

  listExceptions(tenantId: string, from?: string, to?: string) {
    return this.prisma.availabilityException.findMany({
      where: {
        tenantId,
        ...(from || to
          ? {
              date: {
                ...(from ? { gte: new Date(from) } : {}),
                ...(to ? { lte: new Date(to) } : {}),
              },
            }
          : { date: { gte: new Date(new Date().toISOString().slice(0, 10)) } }),
      },
      orderBy: { date: 'asc' },
    });
  }

  async createException(tenantId: string, dto: CreateAvailabilityExceptionDto) {
    const isAvailable = dto.isAvailable ?? false;
    if (isAvailable) {
      if (dto.startMinute == null || dto.endMinute == null) {
        throw new BadRequestException('Janela especial exige startMinute e endMinute');
      }
      if (dto.endMinute <= dto.startMinute) {
        throw new BadRequestException('endMinute deve ser maior que startMinute');
      }
    }

    const created = await this.prisma.availabilityException.create({
      data: {
        tenantId,
        professionalId: dto.professionalId
          ? await this.resolveProfessionalId(tenantId, dto.professionalId)
          : null,
        date: new Date(dto.date),
        isAvailable,
        startMinute: isAvailable ? dto.startMinute : null,
        endMinute: isAvailable ? dto.endMinute : null,
        reason: dto.reason,
      },
    });
    await this.invalidateSlots(tenantId);
    return created;
  }

  async deleteException(tenantId: string, id: string) {
    const exception = await this.prisma.availabilityException.findFirst({
      where: { id, tenantId },
    });
    if (!exception) {
      throw new NotFoundException('Exceção não encontrada');
    }
    await this.prisma.availabilityException.delete({ where: { id } });
    await this.invalidateSlots(tenantId);
    return { ok: true };
  }

  private async invalidateSlots(tenantId: string) {
    await this.cache.invalidatePublicSlotsByTenantId(tenantId, async (id) => {
      const t = await this.prisma.tenant.findUnique({ where: { id }, select: { slug: true } });
      return t?.slug ?? null;
    });
  }

  /** Garante que professionalId pertence ao tenant (evita cross-tenant write). */
  private async resolveProfessionalId(
    tenantId: string,
    professionalId?: string | null,
    fallbackUserId?: string,
  ): Promise<string> {
    const id = professionalId ?? fallbackUserId;
    if (!id) {
      throw new BadRequestException('professionalId é obrigatório');
    }
    const user = await this.prisma.user.findFirst({
      where: { id, tenantId, deletedAt: null, isActive: true },
      select: { id: true },
    });
    if (!user) {
      throw new BadRequestException('Profissional não pertence a este negócio');
    }
    return user.id;
  }
}
