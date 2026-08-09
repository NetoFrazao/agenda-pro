import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { creditLoyaltyForCompletedVisit, LoyaltyTx } from './loyalty-credit';

@Injectable()
export class LoyaltyService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Credita fidelidade dentro de uma TX existente (ou abre uma nova).
   * Idempotente por appointmentId + CREDIT.
   */
  async creditForCompletedAppointment(
    params: {
      tenantId: string;
      clientId: string;
      appointmentId: string;
      priceCents: number;
      pointsPerReal: number;
      loyaltyEnabled: boolean;
    },
    tx?: LoyaltyTx | Prisma.TransactionClient,
  ) {
    if (tx) {
      return creditLoyaltyForCompletedVisit(tx as unknown as LoyaltyTx, params);
    }
    return this.prisma.$transaction((inner) =>
      creditLoyaltyForCompletedVisit(inner as unknown as LoyaltyTx, params),
    );
  }
}
