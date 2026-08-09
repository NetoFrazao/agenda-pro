import { Injectable } from '@nestjs/common';
import { AppointmentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resumo gerencial do período (default: mês corrente).
   * Receita considera apenas atendimentos COMPLETED (dinheiro que entrou).
   */
  async summary(tenantId: string, from?: string, to?: string) {
    const now = new Date();
    const periodStart = from
      ? new Date(from)
      : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const periodEnd = to ? new Date(to) : now;

    const rangeWhere = {
      tenantId,
      startsAt: { gte: periodStart, lte: periodEnd },
    };

    const [byStatus, completedAgg, topServices, professionals, newClients, byProfessional] =
      await Promise.all([
        this.prisma.appointment.groupBy({
          by: ['status'],
          where: rangeWhere,
          _count: true,
        }),
        this.prisma.appointment.aggregate({
          where: { ...rangeWhere, status: AppointmentStatus.COMPLETED },
          _sum: { priceCentsSnapshot: true },
          _count: true,
        }),
        this.prisma.appointment.groupBy({
          by: ['serviceId'],
          where: { ...rangeWhere, status: AppointmentStatus.COMPLETED },
          _count: true,
          _sum: { priceCentsSnapshot: true },
          orderBy: { _sum: { priceCentsSnapshot: 'desc' } },
          take: 5,
        }),
        this.prisma.user.findMany({
          where: { tenantId, deletedAt: null },
          select: { id: true, name: true, commissionPercent: true },
        }),
        this.prisma.client.count({
          where: { tenantId, deletedAt: null, createdAt: { gte: periodStart, lte: periodEnd } },
        }),
        this.prisma.appointment.groupBy({
          by: ['professionalId'],
          where: { ...rangeWhere, status: AppointmentStatus.COMPLETED },
          _count: true,
          _sum: { priceCentsSnapshot: true },
        }),
      ]);

    const statusCount = (status: AppointmentStatus) =>
      byStatus.find((s) => s.status === status)?._count ?? 0;

    const total = byStatus.reduce((acc, s) => acc + s._count, 0);
    const completed = completedAgg._count;
    const noShow = statusCount(AppointmentStatus.NO_SHOW);
    const finished = completed + noShow;
    const revenueCents = completedAgg._sum.priceCentsSnapshot ?? 0;

    const serviceIds = topServices.map((s) => s.serviceId);
    const services =
      serviceIds.length === 0
        ? []
        : await this.prisma.service.findMany({
            where: { id: { in: serviceIds } },
            select: { id: true, name: true },
          });

    return {
      period: { from: periodStart.toISOString(), to: periodEnd.toISOString() },
      totals: {
        appointments: total,
        completed,
        cancelled: statusCount(AppointmentStatus.CANCELLED),
        noShow,
        noShowRate: finished > 0 ? Number((noShow / finished).toFixed(3)) : 0,
        revenueCents,
        avgTicketCents: completed > 0 ? Math.round(revenueCents / completed) : 0,
        newClients,
      },
      topServices: topServices.map((s) => ({
        serviceId: s.serviceId,
        name: services.find((svc) => svc.id === s.serviceId)?.name ?? 'Serviço removido',
        count: s._count,
        revenueCents: s._sum.priceCentsSnapshot ?? 0,
      })),
      byProfessional: byProfessional.map((p) => {
        const professional = professionals.find((u) => u.id === p.professionalId);
        const revenue = p._sum.priceCentsSnapshot ?? 0;
        const commissionPercent = professional?.commissionPercent ?? 0;
        return {
          professionalId: p.professionalId,
          name: professional?.name ?? 'Profissional removido',
          completed: p._count,
          revenueCents: revenue,
          commissionPercent,
          commissionCents: Math.round((revenue * commissionPercent) / 100),
        };
      }),
    };
  }
}
