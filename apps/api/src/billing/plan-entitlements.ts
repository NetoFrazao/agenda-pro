import { PlanCode } from '@prisma/client';

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
