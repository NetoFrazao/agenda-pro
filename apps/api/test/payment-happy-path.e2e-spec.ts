/**
 * Happy-path de pagamento com Mercado Pago test double (override Nest).
 * Requer DATABASE_URL + REDIS_URL (mesmo bootstrap do booking.e2e-spec).
 *
 * Stripe checkout.session.completed permanece coberto em unit
 * (`payment-happy-path.spec.ts` / `billing.service.spec.ts`) — webhook Stripe
 * precisa de rawBody middleware que o Test.createTestingModule não espelha 1:1.
 */
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { hashToken } from '../src/common/crypto/tokens';
import { MercadoPagoService } from '../src/payments/mercadopago.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Payment happy-path — Mercado Pago double (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantId: string;
  let serviceId: string;
  let accessToken: string;

  const runId = `pay-e2e-${Date.now()}`;
  const providerRef = `mp-double-${runId}`;

  const mpDouble = {
    isConfigured: true,
    verifyWebhookSignature: () => true,
    getPayment: jest.fn().mockResolvedValue({
      id: providerRef,
      status: 'approved',
      external_reference: '', // filled per-test
      transaction_amount: 25,
    }),
    createPixCharge: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(MercadoPagoService)
      .useValue(mpDouble)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
    prisma = app.get(PrismaService);

    const slug = `pay-${runId}`;
    const register = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        name: 'Pay E2E',
        email: `${runId}@e2e.local`,
        password: 'SenhaForte123!',
        businessName: `Pay Shop ${runId}`,
        slug,
      })
      .expect(201);

    const raw = register.headers['set-cookie'];
    const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
    accessToken =
      list
        .map((c) => c.split(';')[0])
        .find((c) => c.startsWith('ap_access='))
        ?.slice('ap_access='.length) ?? '';
    tenantId = register.body.tenant.id;

    const service = await request(app.getHttpServer())
      .post('/api/services')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Corte Pay', durationMinutes: 30, priceCents: 5000, depositCents: 2500 })
      .expect(201);
    serviceId = service.body.id;
  });

  afterAll(async () => {
    if (tenantId) {
      await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
    }
    await app?.close();
  });

  it('webhook MP approved confirma PENDING_PAYMENT e enfileira confirmação', async () => {
    const owner = await prisma.user.findFirst({ where: { tenantId, role: 'OWNER' } });
    const client = await prisma.client.create({
      data: { tenantId, name: 'Pagador', phone: '11977776666', email: 'pagador@e2e.local' },
    });
    const rawToken = `pay-token-${runId}`;
    const appt = await prisma.appointment.create({
      data: {
        tenantId,
        professionalId: owner!.id,
        clientId: client.id,
        serviceId,
        startsAt: new Date(Date.now() + 5 * 86_400_000),
        endsAt: new Date(Date.now() + 5 * 86_400_000 + 30 * 60_000),
        status: 'PENDING_PAYMENT',
        manageToken: hashToken(rawToken),
        priceCentsSnapshot: 5000,
        durationMinutesSnapshot: 30,
      },
    });

    await prisma.pixCharge.create({
      data: {
        tenantId,
        appointmentId: appt.id,
        amountCents: 2500,
        status: 'PENDING',
        providerRef,
        expiresAt: new Date(Date.now() + 30 * 60_000),
      },
    });

    mpDouble.getPayment.mockResolvedValue({
      id: providerRef,
      status: 'approved',
      external_reference: appt.id,
      transaction_amount: 25,
    });

    await request(app.getHttpServer())
      .post('/api/webhooks/mercadopago')
      .set('x-signature', 'ts=1,v1=ok')
      .set('x-request-id', 'req-pay-e2e')
      .send({ type: 'payment', data: { id: providerRef } })
      .expect(201);

    const updated = await prisma.appointment.findUnique({ where: { id: appt.id } });
    expect(updated?.status).toBe('CONFIRMED');

    const charge = await prisma.pixCharge.findUnique({ where: { appointmentId: appt.id } });
    expect(charge?.status).toBe('PAID');

    const jobs = await prisma.notificationJob.findMany({
      where: { appointmentId: appt.id },
    });
    expect(jobs.length).toBeGreaterThan(0);
  });
});
