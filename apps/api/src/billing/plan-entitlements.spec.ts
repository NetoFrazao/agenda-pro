import { planAllowsPixDeposit, planAllowsWhatsappReminders } from './plan-entitlements';
import { PlanCode } from '@prisma/client';

describe('plan entitlements', () => {
  it('PIX online só em PRO/BUSINESS', () => {
    expect(planAllowsPixDeposit(PlanCode.STARTER)).toBe(false);
    expect(planAllowsPixDeposit(PlanCode.PRO)).toBe(true);
    expect(planAllowsPixDeposit(PlanCode.BUSINESS)).toBe(true);
  });

  it('WhatsApp reminders só fora do STARTER', () => {
    expect(planAllowsWhatsappReminders(PlanCode.STARTER)).toBe(false);
    expect(planAllowsWhatsappReminders(PlanCode.PRO)).toBe(true);
    expect(planAllowsWhatsappReminders(PlanCode.BUSINESS)).toBe(true);
  });
});
