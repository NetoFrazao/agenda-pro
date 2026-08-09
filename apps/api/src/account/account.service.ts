import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { hashToken } from '../common/crypto/tokens';
import { BillingService } from '../billing/billing.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Política LGPD (A-04) — retenção e exclusão
 *
 * Titular / controlador do estabelecimento (OWNER) pode:
 * - Exportar portabilidade (JSON) via GET /api/account/export
 * - Solicitar exclusão via DELETE /api/account
 *
 * Na exclusão:
 * 1. Cancela assinatura Stripe imediatamente (se houver)
 * 2. Soft-delete do Tenant (deletedAt) — página pública some
 * 3. Anonimiza PII de Users, Clients, Waitlist, Reviews, notas
 * 4. Remove payloads de NotificationJob e tokens de sessão/reset
 * 5. Preserva trilha financeira mínima: PixCharge (valor/status/providerRef,
 *    sem QR/copia-cola) e Appointment (preço/duração/status/datas sem
 *    customerNotes / manageToken rotacionado)
 *
 * Retenção financeira: registros anonimizados de cobrança/agenda ficam para
 * conciliação fiscal/fraude da plataforma; sem PII operacional.
 * Purge físico completo (hard-delete) fica para job futuro / pedido legal.
 */
@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
  ) {}

  /** Exige senha atual do OWNER (sessão roubada não basta). */
  private async assertOwnerPassword(userId: string, password: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null, isActive: true },
      select: { id: true, passwordHash: true, role: true },
    });
    if (!user) throw new UnauthorizedException('Sessão inválida');
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new ForbiddenException('Senha incorreta');
  }

  async exportData(tenantId: string, userId: string, password: string) {
    await this.assertOwnerPassword(userId, password);

    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId, deletedAt: null },
    });
    if (!tenant) throw new NotFoundException('Conta não encontrada');

    const [users, clients, services, appointments, waitlist, reviews, subscription, pixCharges] =
      await Promise.all([
        this.prisma.user.findMany({
          where: { tenantId, deletedAt: null },
          select: {
            id: true,
            email: true,
            name: true,
            phone: true,
            role: true,
            timezone: true,
            commissionPercent: true,
            isActive: true,
            createdAt: true,
          },
        }),
        this.prisma.client.findMany({
          where: { tenantId, deletedAt: null },
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            notes: true,
            tags: true,
            birthday: true,
            marketingOptIn: true,
            loyaltyPoints: true,
            createdAt: true,
          },
        }),
        this.prisma.service.findMany({
          where: { tenantId, deletedAt: null },
          select: {
            id: true,
            name: true,
            description: true,
            durationMinutes: true,
            priceCents: true,
            depositCents: true,
            isActive: true,
          },
        }),
        this.prisma.appointment.findMany({
          where: { tenantId },
          select: {
            id: true,
            startsAt: true,
            endsAt: true,
            status: true,
            priceCentsSnapshot: true,
            durationMinutesSnapshot: true,
            customerNotes: true,
            cancelReason: true,
            clientId: true,
            serviceId: true,
            professionalId: true,
            createdAt: true,
          },
        }),
        this.prisma.waitlistEntry.findMany({
          where: { tenantId },
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
        }),
        this.prisma.review.findMany({
          where: { tenantId },
          select: {
            id: true,
            appointmentId: true,
            rating: true,
            comment: true,
            clientName: true,
            isPublished: true,
            createdAt: true,
          },
        }),
        this.prisma.subscription.findUnique({
          where: { tenantId },
          select: {
            plan: true,
            status: true,
            monthlyBookingLimit: true,
            currentPeriodStart: true,
            currentPeriodEnd: true,
            cancelAtPeriodEnd: true,
            createdAt: true,
          },
        }),
        this.prisma.pixCharge.findMany({
          where: { tenantId },
          select: {
            id: true,
            appointmentId: true,
            amountCents: true,
            status: true,
            provider: true,
            paidAt: true,
            expiresAt: true,
            createdAt: true,
          },
        }),
      ]);

    return {
      exportedAt: new Date().toISOString(),
      purpose: 'LGPD portability (Art. 18)',
      tenant: {
        id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
        timezone: tenant.timezone,
        plan: tenant.plan,
        about: tenant.about,
        address: tenant.address,
        whatsapp: tenant.whatsapp,
        createdAt: tenant.createdAt,
      },
      users,
      clients,
      services,
      appointments,
      waitlist,
      reviews,
      subscription,
      pixCharges,
    };
  }

  async deleteAccount(tenantId: string, userId: string, password: string) {
    await this.assertOwnerPassword(userId, password);

    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId, deletedAt: null },
    });
    if (!tenant) throw new NotFoundException('Conta não encontrada');

    await this.billing.cancelImmediatelyForAccountDeletion(tenantId);

    const anonSlug = `deleted-${tenantId.slice(0, 18)}`;
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.notificationJob.deleteMany({ where: { tenantId } });
      await tx.refreshToken.deleteMany({ where: { user: { tenantId } } });
      await tx.passwordResetToken.deleteMany({ where: { user: { tenantId } } });

      // Anonimiza PII; preserva linhas financeiras (appointments / pix_charges)
      const clients = await tx.client.findMany({
        where: { tenantId },
        select: { id: true },
      });
      for (const c of clients) {
        await tx.client.update({
          where: { id: c.id },
          data: {
            name: 'Titular removido',
            phone: `anon-${c.id.slice(0, 12)}`,
            email: null,
            notes: null,
            tags: [],
            birthday: null,
            marketingOptIn: false,
            deletedAt: now,
          },
        });
      }

      await tx.waitlistEntry.deleteMany({ where: { tenantId } });

      await tx.review.updateMany({
        where: { tenantId },
        data: { clientName: 'Anônimo', comment: null, isPublished: false },
      });

      const appointments = await tx.appointment.findMany({
        where: { tenantId },
        select: { id: true },
      });
      for (const a of appointments) {
        await tx.appointment.update({
          where: { id: a.id },
          data: {
            customerNotes: null,
            cancelReason: null,
            manageToken: hashToken(`revoked_${randomBytes(32).toString('hex')}`),
          },
        });
      }
      await tx.pixCharge.updateMany({
        where: { tenantId },
        data: { copyPaste: null, qrCodeBase64: null },
      });

      await tx.service.updateMany({
        where: { tenantId },
        data: { deletedAt: now, isActive: false },
      });

      const users = await tx.user.findMany({ where: { tenantId }, select: { id: true } });
      for (const u of users) {
        await tx.user.update({
          where: { id: u.id },
          data: {
            email: `deleted+${u.id}@anon.invalid`,
            name: 'Conta removida',
            phone: null,
            passwordHash: `!lgpd-deleted!${randomBytes(16).toString('hex')}`,
            isActive: false,
            deletedAt: now,
          },
        });
      }

      await tx.tenant.update({
        where: { id: tenantId },
        data: {
          deletedAt: now,
          slug: anonSlug,
          name: 'Conta encerrada',
          about: null,
          address: null,
          whatsapp: null,
          loyaltyEnabled: false,
        },
      });
    });

    this.logger.log(
      JSON.stringify({
        event: 'lgpd.account.deleted',
        tenantId,
        deletedByUserId: userId,
        retention: 'pix_charges+appointments_anonymized',
      }),
    );

    return {
      ok: true,
      deletedTenantId: tenantId,
      deletedByUserId: userId,
      message:
        'Conta encerrada: PII anonimizada, assinatura cancelada e trilha financeira mínima retida para auditoria.',
      retention:
        'PixCharge (valor/status) e Appointment (preço/status/datas) preservados sem PII; purge físico sob pedido legal.',
    };
  }
}
