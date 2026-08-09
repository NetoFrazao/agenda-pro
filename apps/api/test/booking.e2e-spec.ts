/**
 * E2E de anti double-booking contra Postgres REAL.
 * Dispara 2 bookings concorrentes no mesmo slot e espera exatamente 1 sucesso.
 * Requer DATABASE_URL e REDIS_URL apontando para serviços vivos (docker compose / CI).
 */
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { hashToken } from '../src/common/crypto/tokens';
import { PrismaService } from '../src/prisma/prisma.service';

function cookieValue(res: request.Response, name: string): string | undefined {
  const raw = res.headers['set-cookie'];
  if (!raw) return undefined;
  const list = Array.isArray(raw) ? raw : [raw];
  for (const entry of list) {
    const part = entry.split(';')[0];
    const eq = part.indexOf('=');
    if (eq > 0 && part.slice(0, eq) === name) {
      return part.slice(eq + 1);
    }
  }
  return undefined;
}

describe('Booking público — concorrência (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accessToken: string;
  let tenantId: string;
  let slug: string;
  let serviceId: string;

  const runId = `e2e-${Date.now()}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    // Espelha o bootstrap real (main.ts)
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

    slug = `barbearia-${runId}`;
    const register = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        name: 'Tester E2E',
        email: `${runId}@e2e.local`,
        password: 'SenhaForte123!',
        businessName: `Barbearia ${runId}`,
        slug,
      })
      .expect(201);

    accessToken = cookieValue(register, 'ap_access') ?? '';
    expect(accessToken).toBeTruthy();
    expect(register.body.accessToken).toBeUndefined();
    tenantId = register.body.tenant.id;

    const service = await request(app.getHttpServer())
      .post('/api/services')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Corte E2E', durationMinutes: 30, priceCents: 5000 })
      .expect(201);
    serviceId = service.body.id;
  });

  afterAll(async () => {
    if (tenantId) {
      await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
    }
    await app?.close();
  });

  function nextBusinessDay(): string {
    const d = new Date();
    do {
      d.setUTCDate(d.getUTCDate() + 1);
    } while ([0, 6].includes(d.getUTCDay())); // registro cria Seg–Sex por padrão
    return d.toISOString().slice(0, 10);
  }

  it('dois clientes disputando o mesmo slot: um ganha, outro leva 409', async () => {
    const date = nextBusinessDay();
    const slotsRes = await request(app.getHttpServer())
      .get(`/api/public/${slug}/slots`)
      .query({ serviceId, date })
      .expect(200);

    const slots: string[] = slotsRes.body.slots;
    expect(slots.length).toBeGreaterThan(0);
    const startsAt = slots[0];

    const book = (phone: string) =>
      request(app.getHttpServer()).post(`/api/public/${slug}/book`).send({
        serviceId,
        startsAt,
        clientName: 'Cliente Corrida',
        clientPhone: phone,
      });

    const [first, second] = await Promise.all([book('11999990001'), book('11999990002')]);
    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([201, 409]);

    const winner = first.status === 201 ? first : second;
    expect(winner.body.manageUrl).toContain('/agendamento/');
    expect(winner.body.manageToken).toBeUndefined();

    const count = await prisma.appointment.count({
      where: { tenantId, startsAt: new Date(startsAt) },
    });
    expect(count).toBe(1);
  });

  it('cliente gerencia o agendamento pelo manage link (confirmar + cancelar bloqueado por prazo)', async () => {
    const date = nextBusinessDay();
    const slotsRes = await request(app.getHttpServer())
      .get(`/api/public/${slug}/slots`)
      .query({ serviceId, date })
      .expect(200);
    const startsAt = slotsRes.body.slots.at(-1);

    const booked = await request(app.getHttpServer())
      .post(`/api/public/${slug}/book`)
      .send({
        serviceId,
        startsAt,
        clientName: 'Cliente Gestor',
        clientPhone: '11999990003',
      })
      .expect(201);

    expect(booked.body.manageToken).toBeUndefined();
    const token = String(booked.body.manageUrl).split('/').pop();
    expect(token).toBeTruthy();

    const detail = await request(app.getHttpServer())
      .get(`/api/public/appointments/${token}`)
      .expect(200);
    expect(detail.body.service.name).toBe('Corte E2E');
    expect(detail.body.canCancel).toBe(true);

    await request(app.getHttpServer())
      .post(`/api/public/appointments/${token}/confirm`)
      .expect(201);

    const confirmed = await prisma.appointment.findUnique({
      where: { manageToken: hashToken(token!) },
    });
    expect(confirmed?.status).toBe('CONFIRMED');

    await request(app.getHttpServer())
      .post(`/api/public/appointments/${token}/cancel`)
      .send({})
      .expect(201);

    const cancelled = await prisma.appointment.findUnique({
      where: { manageToken: hashToken(token!) },
    });
    expect(cancelled?.status).toBe('CANCELLED');
  });

  it('PENDING_PAYMENT: confirm público é bloqueado sem PIX PAID', async () => {
    const owner = await prisma.user.findFirst({ where: { tenantId, role: 'OWNER' } });
    const client = await prisma.client.create({
      data: { tenantId, name: 'PIX Pending', phone: '11955554444' },
    });
    const raw = `e2e-pending-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const appt = await prisma.appointment.create({
      data: {
        tenantId,
        professionalId: owner!.id,
        clientId: client.id,
        serviceId,
        startsAt: new Date(Date.now() + 3 * 86_400_000),
        endsAt: new Date(Date.now() + 3 * 86_400_000 + 30 * 60_000),
        status: 'PENDING_PAYMENT',
        manageToken: hashToken(raw),
        priceCentsSnapshot: 5000,
        durationMinutesSnapshot: 30,
      },
    });
    await prisma.pixCharge.create({
      data: {
        tenantId,
        appointmentId: appt.id,
        amountCents: 1000,
        status: 'PENDING',
        expiresAt: new Date(Date.now() + 30 * 60_000),
      },
    });

    await request(app.getHttpServer()).post(`/api/public/appointments/${raw}/confirm`).expect(400);

    const still = await prisma.appointment.findUnique({ where: { id: appt.id } });
    expect(still?.status).toBe('PENDING_PAYMENT');
  });

  it('isolamento cross-tenant: tenant B não lê/altera cliente nem serviço de A', async () => {
    const runB = `e2e-b-${Date.now()}`;
    const slugB = `barbearia-${runB}`;
    const registerB = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        name: 'Tester B',
        email: `${runB}@e2e.local`,
        password: 'SenhaForte123!',
        businessName: `Barbearia ${runB}`,
        slug: slugB,
      })
      .expect(201);
    const tokenB = cookieValue(registerB, 'ap_access') ?? '';
    const tenantBId = registerB.body.tenant.id;

    try {
      const clientA = await prisma.client.create({
        data: {
          tenantId,
          name: 'Cliente Tenant A',
          phone: '11988887777',
        },
      });

      await request(app.getHttpServer())
        .get(`/api/clients/${clientA.id}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(404);

      await request(app.getHttpServer())
        .patch(`/api/services/${serviceId}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ name: 'Hijack' })
        .expect(404);

      const untouched = await prisma.service.findUnique({ where: { id: serviceId } });
      expect(untouched?.name).toBe('Corte E2E');
    } finally {
      await prisma.tenant.delete({ where: { id: tenantBId } }).catch(() => undefined);
    }
  });

  it('stress controlado: várias requests no mesmo slot → exatamente 1 sucesso', async () => {
    const date = nextBusinessDay();
    const slotsRes = await request(app.getHttpServer())
      .get(`/api/public/${slug}/slots`)
      .query({ serviceId, date })
      .expect(200);
    // Slot distinto do teste de 2-way race (índice 0)
    const startsAt = slotsRes.body.slots[2] ?? slotsRes.body.slots[0];
    expect(startsAt).toBeTruthy();

    // Throttle do book é 10/min — stress cabe no orçamento restante do suite
    const CONCURRENCY = 6;
    const results = await Promise.all(
      Array.from({ length: CONCURRENCY }, (_, i) =>
        request(app.getHttpServer())
          .post(`/api/public/${slug}/book`)
          .send({
            serviceId,
            startsAt,
            clientName: `Stress ${i}`,
            clientPhone: `11977${String(i).padStart(6, '0')}`,
          }),
      ),
    );

    const ok = results.filter((r) => r.status === 201);
    const rejected = results.filter((r) => r.status === 409 || r.status === 429);
    expect(ok).toHaveLength(1);
    expect(rejected.length).toBe(CONCURRENCY - 1);

    const count = await prisma.appointment.count({
      where: { tenantId, startsAt: new Date(startsAt) },
    });
    expect(count).toBe(1);
  });

  it('FSM: dashboard rejeita CANCELLED→COMPLETED', async () => {
    const owner = await prisma.user.findFirst({
      where: { tenantId, role: 'OWNER' },
    });
    expect(owner).toBeTruthy();

    const client = await prisma.client.create({
      data: { tenantId, name: 'FSM Client', phone: '11966665555' },
    });
    const appt = await prisma.appointment.create({
      data: {
        tenantId,
        professionalId: owner!.id,
        clientId: client.id,
        serviceId,
        startsAt: new Date(Date.now() + 7 * 86_400_000),
        endsAt: new Date(Date.now() + 7 * 86_400_000 + 30 * 60_000),
        status: 'SCHEDULED',
        manageToken: hashToken(`e2e-fsm-${Date.now()}`),
        priceCentsSnapshot: 5000,
        durationMinutesSnapshot: 30,
      },
    });

    await request(app.getHttpServer())
      .patch(`/api/appointments/${appt.id}/status`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ status: 'CANCELLED' })
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/api/appointments/${appt.id}/status`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ status: 'COMPLETED' })
      .expect(400);
  });
});
