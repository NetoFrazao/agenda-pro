import { LoyaltyTxnType, Prisma } from '@prisma/client';

export const LOYALTY_REASON_COMPLETED = 'COMPLETED_VISIT';

export type LoyaltyTx = {
  loyaltyTransaction: {
    create: (args: {
      data: {
        tenantId: string;
        clientId: string;
        appointmentId: string;
        type: LoyaltyTxnType;
        points: number;
        reason: string;
        ref?: string | null;
      };
    }) => Promise<unknown>;
  };
  client: {
    update: (args: {
      where: { id: string };
      data: { loyaltyPoints: { increment: number } };
    }) => Promise<unknown>;
  };
};

export function computeLoyaltyPoints(priceCents: number, pointsPerReal: number): number {
  if (priceCents <= 0 || pointsPerReal <= 0) return 0;
  return Math.floor(priceCents / 100) * pointsPerReal;
}

/**
 * Credita pontos por atendimento COMPLETED de forma idempotente.
 * Unique (appointmentId, type=CREDIT) impede double-credit mesmo sob retry/corrida.
 */
export async function creditLoyaltyForCompletedVisit(
  tx: LoyaltyTx,
  params: {
    tenantId: string;
    clientId: string;
    appointmentId: string;
    priceCents: number;
    pointsPerReal: number;
    loyaltyEnabled: boolean;
  },
): Promise<{ credited: boolean; points: number }> {
  if (!params.loyaltyEnabled) return { credited: false, points: 0 };

  const points = computeLoyaltyPoints(params.priceCents, params.pointsPerReal);
  if (points <= 0) return { credited: false, points: 0 };

  try {
    await tx.loyaltyTransaction.create({
      data: {
        tenantId: params.tenantId,
        clientId: params.clientId,
        appointmentId: params.appointmentId,
        type: LoyaltyTxnType.CREDIT,
        points,
        reason: LOYALTY_REASON_COMPLETED,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { credited: false, points: 0 };
    }
    throw error;
  }

  await tx.client.update({
    where: { id: params.clientId },
    data: { loyaltyPoints: { increment: points } },
  });

  return { credited: true, points };
}
