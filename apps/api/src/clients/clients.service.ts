import { Injectable, NotFoundException } from '@nestjs/common';
import { AppointmentStatus, Prisma } from '@prisma/client';
import { ACTIVE_APPOINTMENT_STATUSES } from '../common/availability/availability.engine';
import { DEFAULT_PAGE_SIZE, normalizePage, normalizePageSize } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import {
  inactiveBucket,
  resolveClientSegment,
  visitsPerMonth,
  type ClientSegment,
  type InactiveBucket,
} from './client-segment';

const UPCOMING_STATUSES: AppointmentStatus[] = [...ACTIVE_APPOINTMENT_STATUSES];

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * CRM: lista com métricas agregadas (sem N+1 por cliente).
   * Query opcional `inactiveDays` (30|60|90) para campanhas futuras (respeitar marketingOptIn no envio).
   * Com `segment`: resolve IDs no tenant (groupBy COMPLETED + regras) e só então pagina — total correto.
   * Sem `segment`: pagina no DB e agrega métricas só da página (barato).
   * MEMBER: só clientes com pelo menos um agendamento deste profissional.
   */
  async list(
    tenantId: string,
    search?: string,
    pageInput = 1,
    pageSizeInput = DEFAULT_PAGE_SIZE,
    opts?: {
      segment?: ClientSegment;
      inactiveDays?: InactiveBucket;
      actor?: { userId: string; role: string };
    },
  ) {
    const now = new Date();
    const page = normalizePage(pageInput);
    const pageSize = normalizePageSize(pageSizeInput);
    const scopeProfessionalId = opts?.actor?.role === 'MEMBER' ? opts.actor.userId : undefined;

    const where: Prisma.ClientWhereInput = {
      tenantId,
      deletedAt: null,
      ...(scopeProfessionalId
        ? { appointments: { some: { professionalId: scopeProfessionalId } } }
        : {}),
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

    // Pré-filtro de retenção: última COMPLETED < cutoff (ou sem COMPLETED + createdAt antigo)
    if (opts?.inactiveDays) {
      const retentionClientIds = await this.resolveInactiveClientIds(
        tenantId,
        opts.inactiveDays,
        now,
      );
      where.id = { in: retentionClientIds.length ? retentionClientIds : ['__none__'] };
    }

    // Segmento: filtro + paginação no SQL (sem full-scan em memória)
    if (opts?.segment) {
      const idFilter =
        where.id && typeof where.id === 'object' && 'in' in where.id
          ? (where.id.in as string[])
          : undefined;
      const { ids, total } = await this.findClientIdsBySegment({
        tenantId,
        segment: opts.segment,
        now,
        page,
        pageSize,
        search,
        clientIds: idFilter,
      });
      if (ids.length === 0) {
        return { total, page, pageSize, items: [] };
      }

      const clients = await this.prisma.client.findMany({
        where: { id: { in: ids }, tenantId, deletedAt: null },
        include: { _count: { select: { appointments: true } } },
      });
      const byId = new Map(clients.map((c) => [c.id, c]));
      const metrics = await this.loadClientMetrics(tenantId, ids, now);

      const items = ids
        .map((id) => {
          const client = byId.get(id);
          if (!client) return null;
          const m = metrics.get(client.id)!;
          return {
            id: client.id,
            name: client.name,
            phone: client.phone,
            email: client.email,
            notes: client.notes,
            tags: client.tags,
            birthday: client.birthday,
            marketingOptIn: client.marketingOptIn,
            loyaltyPoints: client.loyaltyPoints,
            createdAt: client.createdAt,
            appointmentsCount: client._count.appointments,
            completedCount: m.completedCount,
            cancelledCount: m.cancelledCount,
            noShowCount: m.noShowCount,
            totalSpentCents: m.totalSpentCents,
            avgTicketCents: m.avgTicketCents,
            visitsPerMonth: m.visitsPerMonth,
            lastVisit: m.lastVisit,
            nextAppointmentAt: m.nextAppointmentAt,
            segment: opts.segment!,
            inactiveBucket: inactiveBucket(m.lastVisit, now),
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);

      return { total, page, pageSize, items };
    }

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
    const metrics = await this.loadClientMetrics(tenantId, clientIds, now);

    const items = clients.map((client) => {
      const m = metrics.get(client.id)!;
      const segment = resolveClientSegment({
        completedCount: m.completedCount,
        totalSpentCents: m.totalSpentCents,
        lastVisitAt: m.lastVisit,
        clientCreatedAt: client.createdAt,
        now,
      });
      return {
        id: client.id,
        name: client.name,
        phone: client.phone,
        email: client.email,
        notes: client.notes,
        tags: client.tags,
        birthday: client.birthday,
        marketingOptIn: client.marketingOptIn,
        loyaltyPoints: client.loyaltyPoints,
        createdAt: client.createdAt,
        appointmentsCount: client._count.appointments,
        completedCount: m.completedCount,
        cancelledCount: m.cancelledCount,
        noShowCount: m.noShowCount,
        totalSpentCents: m.totalSpentCents,
        avgTicketCents: m.avgTicketCents,
        visitsPerMonth: m.visitsPerMonth,
        lastVisit: m.lastVisit,
        nextAppointmentAt: m.nextAppointmentAt,
        segment,
        inactiveBucket: inactiveBucket(m.lastVisit, now),
      };
    });

    return { total, page, pageSize, items };
  }

  async detail(tenantId: string, id: string, opts?: { actor?: { userId: string; role: string } }) {
    const now = new Date();
    const scopeProfessionalId = opts?.actor?.role === 'MEMBER' ? opts.actor.userId : undefined;

    if (scopeProfessionalId) {
      const linked = await this.prisma.appointment.findFirst({
        where: { tenantId, clientId: id, professionalId: scopeProfessionalId },
        select: { id: true },
      });
      if (!linked) throw new NotFoundException('Cliente não encontrado');
    }

    const client = await this.prisma.client.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        appointments: {
          where: scopeProfessionalId ? { professionalId: scopeProfessionalId } : undefined,
          orderBy: { startsAt: 'desc' },
          take: 50,
          select: {
            id: true,
            startsAt: true,
            endsAt: true,
            status: true,
            priceCentsSnapshot: true,
            durationMinutesSnapshot: true,
            service: { select: { name: true } },
            professional: { select: { name: true } },
          },
        },
        loyaltyTransactions: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: {
            id: true,
            type: true,
            points: true,
            reason: true,
            appointmentId: true,
            createdAt: true,
          },
        },
      },
    });
    if (!client) throw new NotFoundException('Cliente não encontrado');

    const metrics = await this.loadClientMetrics(tenantId, [id], now);
    const m = metrics.get(id)!;
    const segment = resolveClientSegment({
      completedCount: m.completedCount,
      totalSpentCents: m.totalSpentCents,
      lastVisitAt: m.lastVisit,
      clientCreatedAt: client.createdAt,
      now,
    });

    const suggestRebooking = m.completedCount > 0 && !m.nextAppointmentAt;

    return {
      id: client.id,
      name: client.name,
      phone: client.phone,
      email: client.email,
      notes: client.notes,
      tags: client.tags,
      birthday: client.birthday,
      marketingOptIn: client.marketingOptIn,
      loyaltyPoints: client.loyaltyPoints,
      createdAt: client.createdAt,
      appointments: client.appointments,
      loyaltyTransactions: client.loyaltyTransactions,
      metrics: {
        completedCount: m.completedCount,
        cancelledCount: m.cancelledCount,
        noShowCount: m.noShowCount,
        totalSpentCents: m.totalSpentCents,
        avgTicketCents: m.avgTicketCents,
        visitsPerMonth: m.visitsPerMonth,
        lastVisit: m.lastVisit,
        nextAppointmentAt: m.nextAppointmentAt,
        firstVisit: m.firstVisit,
      },
      segment,
      inactiveBucket: inactiveBucket(m.lastVisit, now),
      suggestRebooking,
      rebooking: suggestRebooking
        ? {
            suggestedAfterDays: 30,
            message: 'Cliente sem próximo horário — bom momento para remarcar.',
          }
        : null,
    };
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

  async updateMarketingConsent(tenantId: string, id: string, marketingOptIn: boolean) {
    const client = await this.prisma.client.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!client) throw new NotFoundException('Cliente não encontrado');
    return this.prisma.client.update({
      where: { id },
      data: { marketingOptIn },
      select: { id: true, marketingOptIn: true },
    });
  }

  async updateProfile(
    tenantId: string,
    id: string,
    data: { tags?: string[]; birthday?: Date | null; notes?: string | null },
  ) {
    const client = await this.prisma.client.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!client) throw new NotFoundException('Cliente não encontrado');
    return this.prisma.client.update({
      where: { id },
      data: {
        ...(data.tags !== undefined ? { tags: data.tags } : {}),
        ...(data.birthday !== undefined ? { birthday: data.birthday } : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
      },
      select: {
        id: true,
        tags: true,
        birthday: true,
        notes: true,
      },
    });
  }

  /** IDs inativos há ≥ N dias (COMPLETED antiga ou nunca completou). */
  private async resolveInactiveClientIds(
    tenantId: string,
    inactiveDays: InactiveBucket,
    now: Date,
  ): Promise<string[]> {
    const cutoff = new Date(now.getTime() - inactiveDays * 24 * 60 * 60 * 1000);
    const completedGroups = await this.prisma.appointment.groupBy({
      by: ['clientId'],
      where: { tenantId, status: AppointmentStatus.COMPLETED },
      _max: { startsAt: true },
    });
    const staleFromVisits = completedGroups
      .filter((g) => g._max.startsAt && g._max.startsAt < cutoff)
      .map((g) => g.clientId);
    const visitedIds = new Set(completedGroups.map((g) => g.clientId));
    const neverCompleted = await this.prisma.client.findMany({
      where: {
        tenantId,
        deletedAt: null,
        createdAt: { lt: cutoff },
        id: { notIn: [...visitedIds] },
      },
      select: { id: true },
    });
    return [...new Set([...staleFromVisits, ...neverCompleted.map((c) => c.id)])];
  }

  /**
   * Filtra segmento no Postgres (CASE espelha `resolveClientSegment`) e pagina no SQL.
   * Evita carregar todos os clientes do tenant em memória.
   * Constantes alinhadas a `client-segment.ts`: inactive 60d, at_risk 30d, vip 10/50000, frequent 3.
   */
  private async findClientIdsBySegment(args: {
    tenantId: string;
    segment: ClientSegment;
    now: Date;
    page: number;
    pageSize: number;
    search?: string;
    clientIds?: string[];
  }): Promise<{ ids: string[]; total: number }> {
    const { tenantId, segment, now, page, pageSize, search, clientIds } = args;
    if (clientIds && clientIds.length === 0) {
      return { ids: [], total: 0 };
    }

    const inactiveCutoff = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    const atRiskCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const skip = (page - 1) * pageSize;

    const searchFilter = search
      ? Prisma.sql`AND (
          c.name ILIKE ${`%${search}%`}
          OR c.phone LIKE ${`%${search}%`}
          OR (c.email IS NOT NULL AND c.email ILIKE ${`%${search}%`})
        )`
      : Prisma.empty;

    const idFilter =
      clientIds && clientIds.length > 0
        ? Prisma.sql`AND c.id IN (${Prisma.join(clientIds)})`
        : Prisma.empty;

    const segmentCte = Prisma.sql`
      WITH completed AS (
        SELECT
          a."clientId" AS client_id,
          COUNT(*)::int AS completed_count,
          COALESCE(SUM(a."priceCentsSnapshot"), 0)::int AS total_spent,
          MAX(a."startsAt") AS last_visit
        FROM appointments a
        WHERE a."tenantId" = ${tenantId}
          AND a.status = 'COMPLETED'::"AppointmentStatus"
        GROUP BY a."clientId"
      ),
      ranked AS (
        SELECT
          c.id,
          c."createdAt" AS created_at,
          CASE
            WHEN COALESCE(comp.completed_count, 0) = 0 THEN
              CASE
                WHEN c."createdAt" <= ${inactiveCutoff} THEN 'inactive'
                ELSE 'new'
              END
            WHEN comp.last_visit <= ${inactiveCutoff} THEN 'inactive'
            WHEN comp.last_visit <= ${atRiskCutoff} THEN 'at_risk'
            WHEN COALESCE(comp.completed_count, 0) >= 10
              OR COALESCE(comp.total_spent, 0) >= 50000 THEN 'vip'
            WHEN COALESCE(comp.completed_count, 0) >= 3
              AND comp.last_visit > ${atRiskCutoff} THEN 'frequent'
            ELSE 'new'
          END AS segment
        FROM clients c
        LEFT JOIN completed comp ON comp.client_id = c.id
        WHERE c."tenantId" = ${tenantId}
          AND c."deletedAt" IS NULL
          ${searchFilter}
          ${idFilter}
      )
    `;

    const [countRows, pageRows] = await Promise.all([
      this.prisma.$queryRaw<Array<{ total: bigint | number }>>`
        ${segmentCte}
        SELECT COUNT(*)::bigint AS total FROM ranked WHERE segment = ${segment}
      `,
      this.prisma.$queryRaw<Array<{ id: string }>>`
        ${segmentCte}
        SELECT id FROM ranked
        WHERE segment = ${segment}
        ORDER BY created_at DESC
        LIMIT ${pageSize} OFFSET ${skip}
      `,
    ]);

    const total = Number(countRows[0]?.total ?? 0);
    return { ids: pageRows.map((r) => r.id), total };
  }

  /** Agrega métricas por clientId em poucas queries (page-scoped). */
  private async loadClientMetrics(tenantId: string, clientIds: string[], now: Date) {
    type Metrics = {
      completedCount: number;
      cancelledCount: number;
      noShowCount: number;
      totalSpentCents: number;
      avgTicketCents: number;
      visitsPerMonth: number;
      lastVisit: Date | null;
      firstVisit: Date | null;
      nextAppointmentAt: Date | null;
    };

    const empty = (): Metrics => ({
      completedCount: 0,
      cancelledCount: 0,
      noShowCount: 0,
      totalSpentCents: 0,
      avgTicketCents: 0,
      visitsPerMonth: 0,
      lastVisit: null,
      firstVisit: null,
      nextAppointmentAt: null,
    });

    const map = new Map<string, Metrics>();
    for (const id of clientIds) map.set(id, empty());
    if (clientIds.length === 0) return map;

    const [completedStats, cancelledStats, noShowStats, upcoming] = await Promise.all([
      this.prisma.appointment.groupBy({
        by: ['clientId'],
        where: {
          tenantId,
          clientId: { in: clientIds },
          status: AppointmentStatus.COMPLETED,
        },
        _max: { startsAt: true },
        _min: { startsAt: true },
        _sum: { priceCentsSnapshot: true },
        _count: true,
      }),
      this.prisma.appointment.groupBy({
        by: ['clientId'],
        where: {
          tenantId,
          clientId: { in: clientIds },
          status: AppointmentStatus.CANCELLED,
        },
        _count: true,
      }),
      this.prisma.appointment.groupBy({
        by: ['clientId'],
        where: {
          tenantId,
          clientId: { in: clientIds },
          status: AppointmentStatus.NO_SHOW,
        },
        _count: true,
      }),
      this.prisma.appointment.groupBy({
        by: ['clientId'],
        where: {
          tenantId,
          clientId: { in: clientIds },
          status: { in: UPCOMING_STATUSES },
          startsAt: { gt: now },
        },
        _min: { startsAt: true },
      }),
    ]);

    for (const s of completedStats) {
      const m = map.get(s.clientId) ?? empty();
      m.completedCount = s._count;
      m.totalSpentCents = s._sum.priceCentsSnapshot ?? 0;
      m.avgTicketCents = s._count > 0 ? Math.round((s._sum.priceCentsSnapshot ?? 0) / s._count) : 0;
      m.lastVisit = s._max.startsAt ?? null;
      m.firstVisit = s._min.startsAt ?? null;
      m.visitsPerMonth = visitsPerMonth(s._count, s._min.startsAt ?? null, now);
      map.set(s.clientId, m);
    }
    for (const s of cancelledStats) {
      const m = map.get(s.clientId) ?? empty();
      m.cancelledCount = s._count;
      map.set(s.clientId, m);
    }
    for (const s of noShowStats) {
      const m = map.get(s.clientId) ?? empty();
      m.noShowCount = s._count;
      map.set(s.clientId, m);
    }
    for (const s of upcoming) {
      const m = map.get(s.clientId) ?? empty();
      m.nextAppointmentAt = s._min.startsAt ?? null;
      map.set(s.clientId, m);
    }

    return map;
  }
}
