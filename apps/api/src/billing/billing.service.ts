import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PlanCode, SubscriptionStatus } from '@prisma/client';
import Stripe from 'stripe';
import { EnvService } from '../config/env.service';
import { PrismaService } from '../prisma/prisma.service';

const PLAN_META: Record<
  PlanCode,
  {
    name: string;
    description: string;
    monthlyBookingLimit: number | null;
    maxProfessionals: number;
  }
> = {
  STARTER: {
    name: 'Starter',
    description: 'Para autônomos começando',
    monthlyBookingLimit: 60,
    maxProfessionals: 1,
  },
  PRO: {
    name: 'Pro',
    description: 'Lembretes WhatsApp e sinal PIX',
    monthlyBookingLimit: 300,
    maxProfessionals: 1,
  },
  BUSINESS: {
    name: 'Business',
    description: 'Pequeno salão (até 5 profissionais)',
    monthlyBookingLimit: null,
    maxProfessionals: 5,
  },
};

@Injectable()
export class BillingService {
  private stripe: Stripe | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly env: EnvService,
  ) {
    if (this.env.stripeSecretKey) {
      this.stripe = new Stripe(this.env.stripeSecretKey);
    }
  }

  listPlans() {
    const prices = this.env.planPricesCents;
    return (Object.keys(PLAN_META) as PlanCode[]).map((code) => ({
      code,
      ...PLAN_META[code],
      priceCents: prices[code],
      priceCentsMonthly: prices[code],
      currency: 'BRL',
      whatsappReminders: code !== PlanCode.STARTER,
      pixDepositEnabled: code === PlanCode.BUSINESS || code === PlanCode.PRO,
      priceSource: 'env',
    }));
  }

  async createCheckout(tenantId: string, plan: PlanCode) {
    if (plan === PlanCode.STARTER) {
      await this.prisma.tenant.update({
        where: { id: tenantId },
        data: { plan: PlanCode.STARTER },
      });
      await this.prisma.subscription.upsert({
        where: { tenantId },
        create: {
          tenantId,
          plan: PlanCode.STARTER,
          status: SubscriptionStatus.ACTIVE,
          monthlyBookingLimit: PLAN_META.STARTER.monthlyBookingLimit,
        },
        update: {
          plan: PlanCode.STARTER,
          status: SubscriptionStatus.ACTIVE,
          cancelAtPeriodEnd: false,
          monthlyBookingLimit: PLAN_META.STARTER.monthlyBookingLimit,
        },
      });
      return {
        mode: 'free' as const,
        url: `${this.env.appPublicUrl}/dashboard/billing?ok=starter`,
      };
    }

    if (!this.stripe) {
      // Sem Stripe configurado: ativa o plano localmente (dev / demo portfólio)
      await this.activatePlanLocally(tenantId, plan);
      return {
        mode: 'local_demo' as const,
        url: `${this.env.appPublicUrl}/dashboard/billing?ok=demo&plan=${plan}`,
        message:
          'Stripe não configurado — plano ativado em modo demo. Defina STRIPE_SECRET_KEY em produção.',
      };
    }

    const priceId = this.env.stripePriceIds[plan];
    if (!priceId) {
      throw new BadRequestException(`STRIPE_PRICE_${plan} não configurado`);
    }

    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      include: { subscription: true, users: { where: { role: 'OWNER' }, take: 1 } },
    });

    let customerId = tenant.subscription?.stripeCustomerId;
    if (!customerId) {
      const customer = await this.stripe.customers.create({
        email: tenant.users[0]?.email,
        name: tenant.name,
        metadata: { tenantId },
      });
      customerId = customer.id;
      await this.prisma.subscription.upsert({
        where: { tenantId },
        create: {
          tenantId,
          plan,
          status: SubscriptionStatus.INCOMPLETE,
          stripeCustomerId: customerId,
        },
        update: { stripeCustomerId: customerId },
      });
    }

    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${this.env.appPublicUrl}/dashboard/billing?ok=1`,
      cancel_url: `${this.env.appPublicUrl}/dashboard/billing?canceled=1`,
      metadata: { tenantId, plan },
    });

    return { mode: 'stripe' as const, url: session.url };
  }

  async cancel(tenantId: string) {
    const sub = await this.prisma.subscription.findUnique({ where: { tenantId } });
    if (!sub) throw new NotFoundException('Assinatura não encontrada');

    if (this.stripe && sub.stripeSubscriptionId) {
      await this.stripe.subscriptions.update(sub.stripeSubscriptionId, {
        cancel_at_period_end: true,
      });
    }

    await this.prisma.subscription.update({
      where: { tenantId },
      data: { cancelAtPeriodEnd: true },
    });

    return { ok: true, cancelAtPeriodEnd: true };
  }

  async handleStripeWebhook(rawBody: Buffer, signature: string) {
    if (!this.stripe || !this.env.stripeWebhookSecret) {
      throw new ServiceUnavailableException('Webhook Stripe não configurado');
    }

    const event = this.stripe.webhooks.constructEvent(
      rawBody,
      signature,
      this.env.stripeWebhookSecret,
    );

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const tenantId = session.metadata?.tenantId;
      const plan = session.metadata?.plan as PlanCode | undefined;
      if (tenantId && plan) {
        await this.activatePlanLocally(tenantId, plan, session.subscription as string | undefined);
      }
    }

    if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object as Stripe.Subscription;
      await this.prisma.subscription.updateMany({
        where: { stripeSubscriptionId: subscription.id },
        data: {
          status: SubscriptionStatus.CANCELED,
          plan: PlanCode.STARTER,
          cancelAtPeriodEnd: false,
        },
      });
    }

    return { received: true };
  }

  private async activatePlanLocally(
    tenantId: string,
    plan: PlanCode,
    stripeSubscriptionId?: string,
  ) {
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { plan },
    });
    await this.prisma.subscription.upsert({
      where: { tenantId },
      create: {
        tenantId,
        plan,
        status: SubscriptionStatus.ACTIVE,
        monthlyBookingLimit: PLAN_META[plan].monthlyBookingLimit,
        stripeSubscriptionId,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 86400_000),
      },
      update: {
        plan,
        status: SubscriptionStatus.ACTIVE,
        monthlyBookingLimit: PLAN_META[plan].monthlyBookingLimit,
        stripeSubscriptionId,
        cancelAtPeriodEnd: false,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 86400_000),
      },
    });
  }
}
