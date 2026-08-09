import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Exclusão de conta / dados pessoais (LGPD).
 * Remove dados do tenant: clientes, agendamentos, serviços, etc.
 */
@Injectable()
export class AccountService {
  constructor(private readonly prisma: PrismaService) {}

  async deleteAccount(tenantId: string, userId: string) {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId, deletedAt: null },
    });
    if (!tenant) throw new NotFoundException('Conta não encontrada');

    await this.prisma.$transaction(async (tx) => {
      await tx.notificationJob.deleteMany({ where: { tenantId } });
      await tx.appointment.deleteMany({ where: { tenantId } });
      await tx.client.deleteMany({ where: { tenantId } });
      await tx.availabilityException.deleteMany({ where: { tenantId } });
      await tx.availabilityRule.deleteMany({ where: { tenantId } });
      await tx.service.deleteMany({ where: { tenantId } });
      await tx.subscription.deleteMany({ where: { tenantId } });
      await tx.refreshToken.deleteMany({
        where: { user: { tenantId } },
      });
      await tx.user.deleteMany({ where: { tenantId } });
      await tx.tenant.delete({ where: { id: tenantId } });
    });

    return {
      ok: true,
      deletedTenantId: tenantId,
      deletedByUserId: userId,
      message: 'Conta e dados pessoais associados foram excluídos.',
    };
  }
}
