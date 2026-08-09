import {
  planAllowsPixDeposit,
  planAllowsWhatsappReminders,
  subscriptionAllowsPublicBooking,
} from './plan-entitlements';
import { PlanCode, SubscriptionStatus } from '@prisma/client';

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

  it('booking público bloqueia PAST_DUE e INCOMPLETE', () => {
    expect(subscriptionAllowsPublicBooking(undefined)).toBe(true);
    expect(subscriptionAllowsPublicBooking(null)).toBe(true);
    expect(subscriptionAllowsPublicBooking(SubscriptionStatus.ACTIVE)).toBe(true);
    expect(subscriptionAllowsPublicBooking(SubscriptionStatus.TRIALING)).toBe(true);
    expect(subscriptionAllowsPublicBooking(SubscriptionStatus.CANCELED)).toBe(true);
    expect(subscriptionAllowsPublicBooking(SubscriptionStatus.PAST_DUE)).toBe(false);
    expect(subscriptionAllowsPublicBooking(SubscriptionStatus.INCOMPLETE)).toBe(false);
  });
});
