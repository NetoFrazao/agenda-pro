/**
 * E2E de anti double-booking contra Postgres REAL.
 * Dispara 2 bookings concorrentes no mesmo slot e espera exatamente 1 sucesso.
 * Requer DATABASE_URL e REDIS_URL apontando para serviços vivos (docker compose / CI).
 */
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

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

    accessToken = register.body.accessToken;
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

    const token = booked.body.manageToken;

    const detail = await request(app.getHttpServer())
      .get(`/api/public/appointments/${token}`)
      .expect(200);
    expect(detail.body.service.name).toBe('Corte E2E');
    expect(detail.body.canCancel).toBe(true);

    await request(app.getHttpServer())
      .post(`/api/public/appointments/${token}/confirm`)
      .expect(201);

    const confirmed = await prisma.appointment.findUnique({ where: { manageToken: token } });
    expect(confirmed?.status).toBe('CONFIRMED');

    await request(app.getHttpServer())
      .post(`/api/public/appointments/${token}/cancel`)
      .send({})
      .expect(201);

    const cancelled = await prisma.appointment.findUnique({ where: { manageToken: token } });
    expect(cancelled?.status).toBe('CANCELLED');
  });
});
