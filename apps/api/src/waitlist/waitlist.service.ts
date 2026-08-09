import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { WaitlistStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JoinWaitlistDto } from '../appointments/dto/appointment.dto';

@Injectable()
export class WaitlistService {
  constructor(private readonly prisma: PrismaService) {}

  async joinPublic(slug: string, dto: JoinWaitlistDto) {
    const tenant = await this.prisma.tenant.findFirst({
      where: { slug, deletedAt: null },
      select: { id: true },
    });
    if (!tenant) throw new NotFoundException('Profissional não encontrado');

    // M-02: serviceId opcional, mas se enviado precisa existir no tenant
    if (dto.serviceId) {
      const service = await this.prisma.service.findFirst({
        where: { id: dto.serviceId, tenantId: tenant.id, deletedAt: null },
        select: { id: true },
      });
      if (!service) {
        throw new BadRequestException('Serviço inválido para este estabelecimento');
      }
    }

    // Mesmo telefone + mesmo dia = atualiza em vez de duplicar
    const existing = await this.prisma.waitlistEntry.findFirst({
      where: {
        tenantId: tenant.id,
        dateKey: dto.dateKey,
        clientPhone: dto.clientPhone,
        status: { in: [WaitlistStatus.WAITING, WaitlistStatus.NOTIFIED] },
      },
    });
    if (existing) {
      return { ok: true, id: existing.id, alreadyOnList: true };
    }

    const entry = await this.prisma.waitlistEntry.create({
      data: {
        tenantId: tenant.id,
        serviceId: dto.serviceId,
        dateKey: dto.dateKey,
        clientName: dto.clientName,
        clientPhone: dto.clientPhone,
        clientEmail: dto.clientEmail,
      },
    });
    return { ok: true, id: entry.id, alreadyOnList: false };
  }

  list(tenantId: string, dateKey?: string) {
    return this.prisma.waitlistEntry.findMany({
      where: {
        tenantId,
        ...(dateKey ? { dateKey } : {}),
        status: { in: [WaitlistStatus.WAITING, WaitlistStatus.NOTIFIED] },
      },
      orderBy: [{ dateKey: 'asc' }, { createdAt: 'asc' }],
      take: 200,
      select: {
        id: true,
        dateKey: true,
        serviceId: true,
        clientName: true,
        clientPhone: true,
        clientEmail: true,
        status: true,
        createdAt: true,
      },
    });
  }

  async remove(tenantId: string, id: string) {
    const entry = await this.prisma.waitlistEntry.findFirst({ where: { id, tenantId } });
    if (!entry) throw new NotFoundException('Entrada não encontrada');
    await this.prisma.waitlistEntry.delete({ where: { id } });
    return { ok: true };
  }
}
