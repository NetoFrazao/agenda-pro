import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PlanCode, SubscriptionStatus, UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { EnvService } from '../config/env.service';
import { generateRefreshToken, hashToken, ttlToMs } from '../common/crypto/tokens';
import { NotificationsService } from '../notifications/notifications.service';
import { LoginDto, RegisterDto } from './dto/auth.dto';

function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly env: EnvService,
    private readonly notifications: NotificationsService,
  ) {}

  async register(dto: RegisterDto) {
    const email = dto.email.toLowerCase().trim();
    const baseSlug = dto.slug?.trim() || slugify(dto.businessName);
    if (!baseSlug) {
      throw new ConflictException('Não foi possível gerar um slug válido');
    }

    const existingSlug = await this.prisma.tenant.findUnique({ where: { slug: baseSlug } });
    if (existingSlug) {
      throw new ConflictException('Este slug já está em uso');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const timezone = dto.timezone ?? 'America/Sao_Paulo';

    const tenant = await this.prisma.$transaction(async (tx) => {
      const created = await tx.tenant.create({
        data: {
          slug: baseSlug,
          name: dto.businessName,
          timezone,
          plan: PlanCode.STARTER,
          subscription: {
            create: {
              plan: PlanCode.STARTER,
              status: SubscriptionStatus.TRIALING,
              monthlyBookingLimit: 60,
            },
          },
          users: {
            create: {
              email,
              passwordHash,
              name: dto.name,
              role: UserRole.OWNER,
              timezone,
            },
          },
          // Disponibilidade padrão Seg–Sex 09–18
          availability: {
            create: [1, 2, 3, 4, 5].map((dayOfWeek) => ({
              dayOfWeek,
              startMinute: 9 * 60,
              endMinute: 18 * 60,
            })),
          },
        },
        include: { users: true },
      });
      return created;
    });

    const user = tenant.users[0];
    return this.issueTokens(user.id, tenant.id, user.email, user.role, {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      tenant: {
        id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
        timezone: tenant.timezone,
        plan: tenant.plan,
      },
    });
  }

  async login(dto: LoginDto) {
    const email = dto.email.toLowerCase().trim();
    const user = await this.prisma.user.findFirst({
      where: { email, deletedAt: null, isActive: true },
      include: { tenant: true },
    });

    if (!user || user.tenant.deletedAt) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    return this.issueTokens(user.id, user.tenantId, user.email, user.role, {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      tenant: {
        id: user.tenant.id,
        slug: user.tenant.slug,
        name: user.tenant.name,
        timezone: user.tenant.timezone,
        plan: user.tenant.plan,
      },
    });
  }

  async refresh(rawRefreshToken: string) {
    const tokenHash = hashToken(rawRefreshToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: { include: { tenant: true } } },
    });

    if (
      !stored ||
      stored.revokedAt ||
      stored.expiresAt < new Date() ||
      !stored.user.isActive ||
      stored.user.deletedAt ||
      stored.user.tenant.deletedAt
    ) {
      throw new UnauthorizedException('Refresh token inválido');
    }

    // Rotação: revoga o antigo e emite novo par
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    const { user } = stored;
    return this.issueTokens(user.id, user.tenantId, user.email, user.role, {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      tenant: {
        id: user.tenant.id,
        slug: user.tenant.slug,
        name: user.tenant.name,
        timezone: user.tenant.timezone,
        plan: user.tenant.plan,
      },
    });
  }

  async logout(rawRefreshToken: string) {
    const tokenHash = hashToken(rawRefreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { ok: true };
  }

  /**
   * Sempre responde ok (mesmo para e-mail inexistente) — evita enumeração de contas.
   * Token de uso único com validade de 1h, armazenado como hash.
   */
  async forgotPassword(email: string) {
    const user = await this.prisma.user.findFirst({
      where: { email: email.toLowerCase().trim(), deletedAt: null, isActive: true },
    });

    if (user) {
      const rawToken = generateRefreshToken();
      await this.prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(rawToken),
          expiresAt: new Date(Date.now() + 3_600_000),
        },
      });

      const resetUrl = `${this.env.appPublicUrl}/redefinir-senha?token=${rawToken}`;
      await this.notifications.enqueuePasswordReset(user.tenantId, user.email, user.name, resetUrl);
    }

    return { ok: true };
  }

  async resetPassword(rawToken: string, newPassword: string) {
    const tokenHash = hashToken(rawToken);
    const stored = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!stored || stored.usedAt || stored.expiresAt < new Date() || stored.user.deletedAt) {
      throw new BadRequestException('Token inválido ou expirado. Solicite um novo link.');
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: stored.userId },
        data: { passwordHash },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: stored.id },
        data: { usedAt: new Date() },
      }),
      // Sessões antigas ficam inválidas: quem trocou a senha derruba todo mundo
      this.prisma.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    return { ok: true };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      include: { tenant: { include: { subscription: true } } },
    });
    if (!user) {
      throw new UnauthorizedException();
    }
    // Formato esperado pelo frontend: { user, tenant }
    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        timezone: user.timezone ?? user.tenant.timezone,
      },
      tenant: {
        id: user.tenant.id,
        slug: user.tenant.slug,
        name: user.tenant.name,
        timezone: user.tenant.timezone,
        plan: user.tenant.plan,
        subscription: user.tenant.subscription,
        about: user.tenant.about,
        address: user.tenant.address,
        whatsapp: user.tenant.whatsapp,
        minNoticeMinutes: user.tenant.minNoticeMinutes,
        maxAdvanceDays: user.tenant.maxAdvanceDays,
        bufferMinutes: user.tenant.bufferMinutes,
        slotGridMinutes: user.tenant.slotGridMinutes,
        cancelMinHours: user.tenant.cancelMinHours,
        loyaltyEnabled: user.tenant.loyaltyEnabled,
        loyaltyPointsPerReal: user.tenant.loyaltyPointsPerReal,
      },
    };
  }

  private async issueTokens(
    userId: string,
    tenantId: string,
    email: string,
    role: string,
    profile: { user: unknown; tenant: unknown },
  ) {
    const accessToken = await this.jwt.signAsync(
      { sub: userId, tenantId, email, role },
      {
        secret: this.env.jwtAccessSecret,
        expiresIn: this.env.jwtAccessTtl as `${number}${'s' | 'm' | 'h' | 'd'}`,
      },
    );

    const refreshToken = generateRefreshToken();
    const expiresAt = new Date(Date.now() + ttlToMs(this.env.jwtRefreshTtl));

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: hashToken(refreshToken),
        expiresAt,
      },
    });

    return {
      accessToken,
      refreshToken,
      user: profile.user,
      tenant: profile.tenant,
    };
  }
}
