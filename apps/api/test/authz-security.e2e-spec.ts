/**
 * E2E AuthZ / abuse: register throttle, PAST_DUE book, MEMBER CRM write 403.
 * Requer DATABASE_URL e REDIS_URL (mesmo pré-requisito do booking.e2e-spec).
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

describe('AuthZ + abuse controls (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const runId = `authz-${Date.now()}`;
  const tenantIds: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

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
  });

  afterAll(async () => {
    for (const id of tenantIds) {
      await prisma.tenant.delete({ where: { id } }).catch(() => undefined);
    }
    await app?.close();
  });

  it('POST /auth/register retorna 429 após exceder throttle (5/min)', async () => {
    const prefix = `thr-${Date.now()}`;
    const results: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          name: `Throttle ${i}`,
          email: `${prefix}-${i}@e2e.local`,
          password: 'SenhaForte123!',
          businessName: `Shop ${prefix}-${i}`,
          slug: `${prefix}-${i}`,
        });
      results.push(res.status);
      if (res.status === 201 && res.body?.tenant?.id) {
        tenantIds.push(res.body.tenant.id);
      }
    }
    expect(results.slice(0, 5).every((s) => s === 201)).toBe(true);
    expect(results[5]).toBe(429);
  });

  it('book público bloqueado quando subscription PAST_DUE', async () => {
    const slug = `past-due-${runId}`;
    const register = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        name: 'Past Due Owner',
        email: `pastdue-${runId}@e2e.local`,
        password: 'SenhaForte123!',
        businessName: `Past Due ${runId}`,
        slug,
      });

    // Pode bater no throttle do teste anterior — usa seed via prisma se 429
    let tenantId: string;
    let serviceId: string;
    let accessToken: string;

    if (register.status === 201) {
      tenantId = register.body.tenant.id;
      tenantIds.push(tenantId);
      accessToken = cookieValue(register, 'ap_access') ?? '';
      const service = await request(app.getHttpServer())
        .post('/api/services')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Corte', durationMinutes: 30, priceCents: 5000 })
        .expect(201);
      serviceId = service.body.id;
    } else {
      // Fallback: monta tenant direto no DB (ainda valida o gate PAST_DUE no book)
      const created = await prisma.tenant.create({
        data: {
          name: `Past Due ${runId}`,
          slug,
          timezone: 'America/Sao_Paulo',
          users: {
            create: {
              email: `pastdue-db-${runId}@e2e.local`,
              name: 'Owner',
              passwordHash: hashToken('x'),
              role: 'OWNER',
            },
          },
          subscription: { create: { status: 'PAST_DUE' } },
          services: {
            create: { name: 'Corte', durationMinutes: 30, priceCents: 5000 },
          },
        },
        include: { services: true },
      });
      tenantId = created.id;
      tenantIds.push(tenantId);
      serviceId = created.services[0].id;
    }

    await prisma.subscription.update({
      where: { tenantId },
      data: { status: 'PAST_DUE' },
    });

    const book = await request(app.getHttpServer())
      .post(`/api/public/${slug}/book`)
      .send({
        serviceId,
        startsAt: new Date(Date.now() + 3 * 86_400_000).toISOString(),
        clientName: 'Cliente',
        clientPhone: '11999990099',
      });

    expect(book.status).toBe(409);
  });

  it('MEMBER recebe 403 em escrita de CRM (notes)', async () => {
    const slug = `member-crm-${runId}`;
    const register = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        name: 'CRM Owner',
        email: `crm-owner-${runId}@e2e.local`,
        password: 'SenhaForte123!',
        businessName: `CRM ${runId}`,
        slug,
      });

    let ownerToken: string;
    let tenantId: string;

    if (register.status === 201) {
      ownerToken = cookieValue(register, 'ap_access') ?? '';
      tenantId = register.body.tenant.id;
      tenantIds.push(tenantId);
    } else {
      // Se throttle: cria via login de um tenant já criado no 1º teste
      const existing = tenantIds[0];
      expect(existing).toBeTruthy();
      tenantId = existing;
      const owner = await prisma.user.findFirst({
        where: { tenantId, role: 'OWNER' },
      });
      const login = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: owner!.email,
          password: 'SenhaForte123!',
          tenantSlug: (await prisma.tenant.findUnique({ where: { id: tenantId } }))!.slug,
        })
        .expect(201);
      ownerToken = cookieValue(login, 'ap_access') ?? '';
    }

    // Garante plano com espaço para 2 profissionais
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { plan: 'BUSINESS' },
    });
    await prisma.planDefinition.upsert({
      where: { code: 'BUSINESS' },
      create: {
        code: 'BUSINESS',
        name: 'Business',
        maxProfessionals: 10,
        monthlyBookingLimit: null,
        whatsappReminders: true,
        pixDepositEnabled: true,
      },
      update: { maxProfessionals: 10 },
    });

    const memberEmail = `crm-member-${runId}@e2e.local`;
    const member = await request(app.getHttpServer())
      .post('/api/team')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'Membro',
        email: memberEmail,
        password: 'SenhaForte123!',
      })
      .expect(201);

    expect(member.body.role).toBe('MEMBER');

    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const memberLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: memberEmail,
        password: 'SenhaForte123!',
        tenantSlug: tenant.slug,
      })
      .expect(201);
    const memberToken = cookieValue(memberLogin, 'ap_access') ?? '';

    const client = await prisma.client.create({
      data: {
        tenantId,
        name: 'Cliente CRM',
        phone: '11988886666',
      },
    });

    await request(app.getHttpServer())
      .patch(`/api/clients/${client.id}/notes`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ notes: 'não deveria' })
      .expect(403);
  });
});
