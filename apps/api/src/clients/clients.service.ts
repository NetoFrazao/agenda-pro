import { Injectable, NotFoundException } from '@nestjs/common';
import { AppointmentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  /** CRM light: lista com última visita, total gasto e faltas por cliente. */
  async list(tenantId: string, search?: string, page = 1, pageSize = 20) {
    const where: Prisma.ClientWhereInput = {
      tenantId,
      deletedAt: null,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search } },
              { email: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [clients, total] = await Promise.all([
      this.prisma.client.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { _count: { select: { appointments: true } } },
      }),
      this.prisma.client.count({ where }),
    ]);

    const clientIds = clients.map((c) => c.id);
    const [completedStats, noShows] = await Promise.all([
      this.prisma.appointment.groupBy({
        by: ['clientId'],
        where: {
          clientId: { in: clientIds },
          status: AppointmentStatus.COMPLETED,
        },
        _max: { startsAt: true },
        _sum: { priceCentsSnapshot: true },
        _count: true,
      }),
      this.prisma.appointment.groupBy({
        by: ['clientId'],
        where: { clientId: { in: clientIds }, status: AppointmentStatus.NO_SHOW },
        _count: true,
      }),
    ]);

    return {
      total,
      page,
      pageSize,
      items: clients.map((client) => {
        const stats = completedStats.find((s) => s.clientId === client.id);
        return {
          id: client.id,
          name: client.name,
          phone: client.phone,
          email: client.email,
          notes: client.notes,
          loyaltyPoints: client.loyaltyPoints,
          createdAt: client.createdAt,
          appointmentsCount: client._count.appointments,
          completedCount: stats?._count ?? 0,
          totalSpentCents: stats?._sum.priceCentsSnapshot ?? 0,
          lastVisit: stats?._max.startsAt ?? null,
          noShowCount: noShows.find((s) => s.clientId === client.id)?._count ?? 0,
        };
      }),
    };
  }

  async detail(tenantId: string, id: string) {
    const client = await this.prisma.client.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        appointments: {
          orderBy: { startsAt: 'desc' },
          take: 50,
          include: {
            service: { select: { name: true } },
            professional: { select: { name: true } },
          },
        },
      },
    });
    if (!client) throw new NotFoundException('Cliente não encontrado');
    return client;
  }

  async updateNotes(tenantId: string, id: string, notes: string | null) {
    const client = await this.prisma.client.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!client) throw new NotFoundException('Cliente não encontrado');
    return this.prisma.client.update({
      where: { id },
      data: { notes },
      select: { id: true, notes: true },
    });
  }
}
