import { WaitlistStatus, type Prisma } from '@prisma/client';
import { toDateKey } from '../availability/availability.engine';

export type WaitlistNotifyTenant = {
  name: string;
  slug: string;
  timezone: string;
};

export type WaitlistNotifier = {
  enqueueWaitlistSlotOpen(input: {
    tenantId: string;
    tenantName: string;
    tenantSlug: string;
    dateKey: string;
    clientName: string;
    clientPhone: string;
    clientEmail: string | null;
  }): Promise<unknown>;
};

type TxClient = {
  waitlistEntry: {
    findFirst: (args: Prisma.WaitlistEntryFindFirstArgs) => Promise<{
      id: string;
      clientName: string;
      clientPhone: string;
      clientEmail: string | null;
    } | null>;
    updateMany: (args: Prisma.WaitlistEntryUpdateManyArgs) => Promise<{ count: number }>;
  };
};

type PrismaWithTx = TxClient & {
  $transaction: <T>(fn: (tx: TxClient) => Promise<T>) => Promise<T>;
};

/**
 * Notifica o próximo candidato WAITING do dia (FIFO) com claim atômico.
 * No máximo 1 pessoa por liberação de slot; corridas não notificam o mesmo 2×.
 */
export async function notifyNextWaitlistCandidate(
  prisma: PrismaWithTx,
  notifications: WaitlistNotifier,
  tenantId: string,
  slotDate: Date,
  tenant: WaitlistNotifyTenant,
): Promise<boolean> {
  const dateKey = toDateKey(slotDate, tenant.timezone);

  const claimed = await prisma.$transaction(async (tx) => {
    const next = await tx.waitlistEntry.findFirst({
      where: { tenantId, dateKey, status: WaitlistStatus.WAITING },
      orderBy: { createdAt: 'asc' },
    });
    if (!next) return null;

    const updated = await tx.waitlistEntry.updateMany({
      where: { id: next.id, status: WaitlistStatus.WAITING },
      data: { status: WaitlistStatus.NOTIFIED, notifiedAt: new Date() },
    });
    if (updated.count === 0) return null;

    return next;
  });

  if (!claimed) return false;

  await notifications.enqueueWaitlistSlotOpen({
    tenantId,
    tenantName: tenant.name,
    tenantSlug: tenant.slug,
    dateKey,
    clientName: claimed.clientName,
    clientPhone: claimed.clientPhone,
    clientEmail: claimed.clientEmail,
  });

  return true;
}
