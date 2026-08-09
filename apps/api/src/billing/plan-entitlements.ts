import { PlanCode, SubscriptionStatus } from '@prisma/client';

/**
 * Fonte única das flags de plano anunciadas em listPlans.
 * Usar estes helpers no booking/notificações — não confiar só no marketing.
 */
export function planAllowsPixDeposit(plan: PlanCode): boolean {
  return plan === PlanCode.PRO || plan === PlanCode.BUSINESS;
}

export function planAllowsWhatsappReminders(plan: PlanCode): boolean {
  return plan !== PlanCode.STARTER;
}

/**
 * Booking público: inadimplente (PAST_DUE) não aceita novos agendamentos.
 * CANCELED/STARTER livre e TRIALING/ACTIVE seguem liberados.
 */
export function subscriptionAllowsPublicBooking(
  status: SubscriptionStatus | null | undefined,
): boolean {
  if (status == null) return true;
  return status !== SubscriptionStatus.PAST_DUE && status !== SubscriptionStatus.INCOMPLETE;
}
