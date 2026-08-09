import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateServiceDto, UpdateServiceDto } from './dto/service.dto';

@Injectable()
export class ServicesService {
  constructor(private readonly prisma: PrismaService) {}

  list(tenantId: string) {
    return this.prisma.service.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async create(tenantId: string, dto: CreateServiceDto) {
    return this.prisma.service.create({
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
  }

  async update(tenantId: string, id: string, dto: UpdateServiceDto) {
    await this.ensureOwned(tenantId, id);
    return this.prisma.service.update({
      where: { id },
      data: { ...dto },
    });
  }

  async remove(tenantId: string, id: string) {
    await this.ensureOwned(tenantId, id);
    return this.prisma.service.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
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
