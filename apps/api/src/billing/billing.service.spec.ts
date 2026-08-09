import { ServiceUnavailableException } from '@nestjs/common';
import { PlanCode } from '@prisma/client';
import { BillingService } from './billing.service';

describe('BillingService — C-01 local_demo guard', () => {
  function build(opts: {
    nodeEnv: 'development' | 'test' | 'production';
    allowBillingDemo: boolean;
    stripeSecretKey?: string;
  }) {
    const prisma = {
      tenant: { update: jest.fn(), findUniqueOrThrow: jest.fn() },
      subscription: { upsert: jest.fn() },
    };
    const env = {
      nodeEnv: opts.nodeEnv,
      allowBillingDemo: opts.allowBillingDemo,
      stripeSecretKey: opts.stripeSecretKey ?? '',
      stripeWebhookSecret: '',
      stripePriceIds: { STARTER: '', PRO: '', BUSINESS: '' },
      appPublicUrl: 'http://localhost:3000',
      planPricesCents: { STARTER: 0, PRO: 4990, BUSINESS: 9990 },
    };
    const service = new BillingService(prisma as never, env as never);
    return { service, prisma };
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
});
