import { PixChargeStatus, PlanCode } from '@prisma/client';
import { PaymentsController } from './payments.controller';
import { BillingService } from '../billing/billing.service';

/**
 * Payment happy-path com test doubles (Mercado Pago + Stripe).
 * Não chama APIs externas — cobre orquestração webhook → lifecycle / plano local.
 *
 * E2E Nest+Postgres com override: `apps/api/test/payment-happy-path.e2e-spec.ts`.
 */
describe('Payment happy-path — MP + Stripe doubles', () => {
  it('MP approved → confirmPaid (happy path)', async () => {
    const confirmPaid = jest.fn().mockResolvedValue('confirmed');
    const getPayment = jest.fn().mockResolvedValue({
      id: 9001,
      status: 'approved',
      external_reference: 'appt-pay-1',
      transaction_amount: 30,
    });
    const findUnique = jest.fn().mockResolvedValue({
      appointmentId: 'appt-pay-1',
      amountCents: 3000,
      status: PixChargeStatus.PENDING,
      providerRef: '9001',
    });

    const controller = new PaymentsController(
      { pixCharge: { findUnique } } as never,
      {
        isConfigured: true,
        verifyWebhookSignature: () => true,
        getPayment,
      } as never,
      {
        confirmPaid,
        releasePendingPayment: jest.fn(),
        markRefunded: jest.fn(),
      } as never,
    );

    const result = await controller.mercadopago(
      { type: 'payment', data: { id: 9001 } },
      'ts=1,v1=ok',
      'req-pay',
    );

    expect(result).toEqual({ ok: true });
    expect(getPayment).toHaveBeenCalledWith('9001');
    expect(confirmPaid).toHaveBeenCalledWith('appt-pay-1');
  });

  it('Stripe checkout.session.completed ativa plano (double constructEvent)', async () => {
    const prisma = {
      tenant: {
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      subscription: {
        upsert: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const env = {
      nodeEnv: 'test' as const,
      allowBillingDemo: false,
      stripeSecretKey: '',
      stripeWebhookSecret: 'whsec_test_qa',
      stripePriceIds: { STARTER: '', PRO: 'price_pro', BUSINESS: '' },
      appPublicUrl: 'http://localhost:3000',
      planPricesCents: { STARTER: 0, PRO: 4990, BUSINESS: 9990 },
    };

    const service = new BillingService(prisma as never, env as never);
    const constructEvent = jest.fn().mockReturnValue({
      type: 'checkout.session.completed',
      data: {
        object: {
          metadata: { tenantId: 't-pay', plan: PlanCode.PRO },
          subscription: 'sub_pay_1',
        },
      },
    });
    (
      service as unknown as { stripe: { webhooks: { constructEvent: typeof constructEvent } } }
    ).stripe = { webhooks: { constructEvent } };

    await expect(service.handleStripeWebhook(Buffer.from('{}'), 'sig_test')).resolves.toEqual({
      received: true,
    });

    expect(constructEvent).toHaveBeenCalled();
    expect(prisma.subscription.upsert).toHaveBeenCalled();
    expect(prisma.tenant.update).toHaveBeenCalledWith({
      where: { id: 't-pay' },
      data: { plan: PlanCode.PRO },
    });
  });
});
