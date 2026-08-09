import { Injectable, NotFoundException } from '@nestjs/common';
import { RedisCacheService } from '../common/cache/redis-cache.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateServiceDto, UpdateServiceDto } from './dto/service.dto';

@Injectable()
export class ServicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: RedisCacheService,
  ) {}

  list(tenantId: string) {
    return this.prisma.service.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        description: true,
        durationMinutes: true,
        priceCents: true,
        depositCents: true,
        isActive: true,
        sortOrder: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async create(tenantId: string, dto: CreateServiceDto) {
    const created = await this.prisma.service.create({
      data: {
        tenantId,
        name: dto.name,
        description: dto.description,
        durationMinutes: dto.durationMinutes,
        priceCents: dto.priceCents,
        depositCents: dto.depositCents ?? 0,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
    await this.invalidateProfile(tenantId);
    return created;
  }

  async update(tenantId: string, id: string, dto: UpdateServiceDto) {
    await this.ensureOwned(tenantId, id);
    const updated = await this.prisma.service.update({
      where: { id },
      data: { ...dto },
    });
    await this.invalidateProfile(tenantId);
    return updated;
  }

  async remove(tenantId: string, id: string) {
    await this.ensureOwned(tenantId, id);
    const updated = await this.prisma.service.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
    await this.invalidateProfile(tenantId);
    return updated;
  }

  private async invalidateProfile(tenantId: string) {
    await this.cache.invalidatePublicProfileByTenantId(tenantId, async (id) => {
      const t = await this.prisma.tenant.findUnique({ where: { id }, select: { slug: true } });
      return t?.slug ?? null;
    });
  }

  private async ensureOwned(tenantId: string, id: string) {
    const service = await this.prisma.service.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!service) {
      throw new NotFoundException('Serviço não encontrado');
    }
    return service;
  }
}
