import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { RedisCacheService } from '../common/cache/redis-cache.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTeamMemberDto, UpdateTeamMemberDto } from './dto/team.dto';

const MEMBER_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  commissionPercent: true,
  isActive: true,
  createdAt: true,
} as const;

@Injectable()
export class TeamService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: RedisCacheService,
  ) {}

  list(tenantId: string) {
    return this.prisma.user.findMany({
      where: { tenantId, deletedAt: null },
      select: MEMBER_SELECT,
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async create(tenantId: string, requesterRole: string, dto: CreateTeamMemberDto) {
    this.assertOwner(requesterRole);

    // Limite de profissionais do plano (PlanDefinition)
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const plan = await this.prisma.planDefinition.findUnique({ where: { code: tenant.plan } });
    const activeCount = await this.prisma.user.count({
      where: { tenantId, deletedAt: null, isActive: true },
    });
    if (plan && activeCount >= plan.maxProfessionals) {
      throw new ConflictException(
        `Seu plano permite até ${plan.maxProfessionals} profissional(is). Faça upgrade para adicionar mais.`,
      );
    }

    const email = dto.email.toLowerCase().trim();
    const existing = await this.prisma.user.findFirst({ where: { tenantId, email } });
    if (existing) {
      throw new ConflictException('Já existe um profissional com este e-mail');
    }

    const created = await this.prisma.user.create({
      data: {
        tenantId,
        email,
        name: dto.name,
        phone: dto.phone,
        passwordHash: await bcrypt.hash(dto.password, 10),
        role: UserRole.MEMBER,
        commissionPercent: dto.commissionPercent ?? 0,
      },
      select: MEMBER_SELECT,
    });
    await this.cache.invalidatePublicProfile(tenant.slug);
    return created;
  }

  async update(tenantId: string, requesterRole: string, id: string, dto: UpdateTeamMemberDto) {
    this.assertOwner(requesterRole);
    const user = await this.prisma.user.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!user) throw new NotFoundException('Profissional não encontrado');
    if (user.role === UserRole.OWNER && dto.isActive === false) {
      throw new BadRequestException('O dono da conta não pode ser desativado');
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: dto,
      select: MEMBER_SELECT,
    });
    await this.invalidateProfile(tenantId);
    return updated;
  }

  async remove(tenantId: string, requesterRole: string, requesterId: string, id: string) {
    this.assertOwner(requesterRole);
    if (id === requesterId) {
      throw new BadRequestException('Você não pode remover a si mesmo');
    }
    const user = await this.prisma.user.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!user) throw new NotFoundException('Profissional não encontrado');
    if (user.role === UserRole.OWNER) {
      throw new BadRequestException('O dono da conta não pode ser removido');
    }

    // Soft-delete: preserva histórico de agendamentos do profissional
    await this.prisma.user.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
    await this.invalidateProfile(tenantId);
    return { ok: true };
  }

  private async invalidateProfile(tenantId: string) {
    await this.cache.invalidatePublicProfileByTenantId(tenantId, async (id) => {
      const t = await this.prisma.tenant.findUnique({ where: { id }, select: { slug: true } });
      return t?.slug ?? null;
    });
  }

  private assertOwner(role: string) {
    if (role !== UserRole.OWNER) {
      throw new ForbiddenException('Apenas o dono da conta pode gerenciar a equipe');
    }
  }
}
