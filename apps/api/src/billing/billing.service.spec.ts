import { ServiceUnavailableException } from '@nestjs/common';
import { PlanCode, SubscriptionStatus } from '@prisma/client';
import { BillingService } from './billing.service';

describe('BillingService — C-01 local_demo guard', () => {
  function build(opts: {
    nodeEnv: 'development' | 'test' | 'production';
    allowBillingDemo: boolean;
    stripeSecretKey?: string;
    stripeWebhookSecret?: string;
  }) {
    const prisma = {
      tenant: { update: jest.fn(), updateMany: jest.fn(), findUniqueOrThrow: jest.fn() },
      subscription: {
        upsert: jest.fn(),
        findUnique: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn(),
      },
    };
    const env = {
      nodeEnv: opts.nodeEnv,
      allowBillingDemo: opts.allowBillingDemo,
      stripeSecretKey: opts.stripeSecretKey ?? '',
      stripeWebhookSecret: opts.stripeWebhookSecret ?? '',
      stripePriceIds: { STARTER: '', PRO: '', BUSINESS: '' },
      appPublicUrl: 'http://localhost:3000',
      planPricesCents: { STARTER: 0, PRO: 4990, BUSINESS: 9990 },
    };
    const service = new BillingService(prisma as never, env as never);
    return { service, prisma, env };
  }

  it('em produção sem Stripe não ativa PRO (fail-closed)', async () => {
    const { service, prisma } = build({
      nodeEnv: 'production',
      allowBillingDemo: true,
    });
    await expect(service.createCheckout('tenant-1', PlanCode.PRO)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(prisma.tenant.update).not.toHaveBeenCalled();
  });

  it('em desenvolvimento sem flag não ativa PRO', async () => {
    const { service, prisma } = build({
      nodeEnv: 'development',
      allowBillingDemo: false,
    });
    await expect(service.createCheckout('tenant-1', PlanCode.PRO)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(prisma.tenant.update).not.toHaveBeenCalled();
  });

  it('em desenvolvimento com ALLOW_BILLING_DEMO=true ativa local_demo', async () => {
    const { service, prisma } = build({
      nodeEnv: 'development',
      allowBillingDemo: true,
    });
    prisma.tenant.update.mockResolvedValue({});
    prisma.subscription.upsert.mockResolvedValue({});

    const result = await service.createCheckout('tenant-1', PlanCode.PRO);
    expect(result.mode).toBe('local_demo');
    expect(prisma.tenant.update).toHaveBeenCalled();
  });

  it('STARTER continua gratuito sem Stripe', async () => {
    const { service, prisma } = build({
      nodeEnv: 'production',
      allowBillingDemo: false,
    });
    prisma.tenant.update.mockResolvedValue({});
    prisma.subscription.upsert.mockResolvedValue({});

    const result = await service.createCheckout('tenant-1', PlanCode.STARTER);
    expect(result.mode).toBe('free');
  });

  it('STARTER com stripeSubscriptionId e sem Stripe falha sem persistir', async () => {
    const { service, prisma } = build({
      nodeEnv: 'production',
      allowBillingDemo: false,
    });
    prisma.subscription.findUnique.mockResolvedValue({
      stripeSubscriptionId: 'sub_live_1',
    });

    await expect(service.createCheckout('tenant-1', PlanCode.STARTER)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(prisma.tenant.update).not.toHaveBeenCalled();
    expect(prisma.subscription.upsert).not.toHaveBeenCalled();
  });

  it('STARTER com stripeSubscriptionId cancela no Stripe e limpa o ID', async () => {
    const { service, prisma } = build({
      nodeEnv: 'production',
      allowBillingDemo: false,
    });
    prisma.subscription.findUnique.mockResolvedValue({ stripeSubscriptionId: 'sub_live_1' });
    prisma.tenant.update.mockResolvedValue({});
    prisma.subscription.upsert.mockResolvedValue({});
    const cancel = jest.fn().mockResolvedValue({ id: 'sub_live_1', status: 'canceled' });
    (service as unknown as { stripe: { subscriptions: { cancel: typeof cancel } } }).stripe = {
      subscriptions: { cancel },
    };

    const result = await service.createCheckout('tenant-1', PlanCode.STARTER);
    expect(result.mode).toBe('free');
    expect(cancel).toHaveBeenCalledWith('sub_live_1');
    expect(prisma.subscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          plan: PlanCode.STARTER,
          stripeSubscriptionId: null,
        }),
      }),
    );
  });

  it('STARTER não persiste se cancel Stripe falhar', async () => {
    const { service, prisma } = build({
      nodeEnv: 'production',
      allowBillingDemo: false,
    });
    prisma.subscription.findUnique.mockResolvedValue({ stripeSubscriptionId: 'sub_live_1' });
    (service as unknown as { stripe: { subscriptions: { cancel: jest.Mock } } }).stripe = {
      subscriptions: { cancel: jest.fn().mockRejectedValue(new Error('stripe down')) },
    };

    await expect(service.createCheckout('tenant-1', PlanCode.STARTER)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(prisma.tenant.update).not.toHaveBeenCalled();
  });
});

describe('BillingService — handleStripeWebhook (signature mock)', () => {
  function buildWebhookReady() {
    const prisma = {
      tenant: { update: jest.fn(), updateMany: jest.fn() },
      subscription: {
        upsert: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    // Sem stripeSecretKey: evita `new Stripe()` no Jest (default export CJS).
    // Injetamos o client mock com constructEvent (caminho real do webhook).
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
    const constructEvent = jest.fn();
    (
      service as unknown as { stripe: { webhooks: { constructEvent: typeof constructEvent } } }
    ).stripe = {
      webhooks: { constructEvent },
    };
    return { service, prisma, constructEvent };
  }

  it('503 quando Stripe ou webhook secret ausentes', async () => {
    const prisma = {
      tenant: { update: jest.fn(), updateMany: jest.fn() },
      subscription: { upsert: jest.fn(), updateMany: jest.fn() },
    };
    const service = new BillingService(
      prisma as never,
      {
        nodeEnv: 'test',
        allowBillingDemo: false,
        stripeSecretKey: '',
        stripeWebhookSecret: '',
        stripePriceIds: { STARTER: '', PRO: '', BUSINESS: '' },
        appPublicUrl: 'http://localhost:3000',
        planPricesCents: { STARTER: 0, PRO: 4990, BUSINESS: 9990 },
      } as never,
    );
    await expect(service.handleStripeWebhook(Buffer.from('{}'), 'sig')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('propaga erro quando constructEvent rejeita assinatura', async () => {
    const { service, constructEvent, prisma } = buildWebhookReady();
    constructEvent.mockImplementation(() => {
      throw new Error('No signatures found matching the expected signature for payload');
    });

    await expect(
      service.handleStripeWebhook(Buffer.from('{"id":"evt_1"}'), 't=1,v1=bad'),
    ).rejects.toThrow(/signature/i);
    expect(constructEvent).toHaveBeenCalledWith(
      Buffer.from('{"id":"evt_1"}'),
      't=1,v1=bad',
      'whsec_test_qa',
    );
    expect(prisma.subscription.updateMany).not.toHaveBeenCalled();
  });

  it('checkout.session.completed ativa plano localmente', async () => {
    const { service, constructEvent, prisma } = buildWebhookReady();
    constructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      data: {
        object: {
          metadata: { tenantId: 't1', plan: PlanCode.PRO },
          subscription: 'sub_abc',
        },
      },
    });
    prisma.tenant.update.mockResolvedValue({});

    await expect(service.handleStripeWebhook(Buffer.from('{}'), 't=1,v1=ok')).resolves.toEqual({
      received: true,
    });

    expect(prisma.tenant.update).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { plan: PlanCode.PRO },
    });
    expect(prisma.subscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: 't1' },
        create: expect.objectContaining({
          plan: PlanCode.PRO,
          stripeSubscriptionId: 'sub_abc',
          status: SubscriptionStatus.ACTIVE,
        }),
      }),
    );
  });

  it('invoice.payment_failed marca PAST_DUE', async () => {
    const { service, constructEvent, prisma } = buildWebhookReady();
    constructEvent.mockReturnValue({
      type: 'invoice.payment_failed',
      data: { object: { subscription: 'sub_due' } },
    });

    await service.handleStripeWebhook(Buffer.from('{}'), 'sig');

    expect(prisma.subscription.updateMany).toHaveBeenCalledWith({
      where: { stripeSubscriptionId: 'sub_due' },
      data: { status: SubscriptionStatus.PAST_DUE },
    });
  });

  it('customer.subscription.deleted rebaixa para STARTER', async () => {
    const { service, constructEvent, prisma } = buildWebhookReady();
    constructEvent.mockReturnValue({
      type: 'customer.subscription.deleted',
      data: { object: { id: 'sub_gone' } },
    });

    await service.handleStripeWebhook(Buffer.from('{}'), 'sig');

    expect(prisma.subscription.updateMany).toHaveBeenCalledWith({
      where: { stripeSubscriptionId: 'sub_gone' },
      data: {
        status: SubscriptionStatus.CANCELED,
        plan: PlanCode.STARTER,
        cancelAtPeriodEnd: false,
      },
    });
    expect(prisma.tenant.updateMany).toHaveBeenCalledWith({
      where: { subscription: { stripeSubscriptionId: 'sub_gone' } },
      data: { plan: PlanCode.STARTER },
    });
  });
});
