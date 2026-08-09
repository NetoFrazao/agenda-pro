import { hashSync } from 'bcryptjs';
import { PlanCode, PrismaClient, SubscriptionStatus } from '@prisma/client';

/**
 * Seed idempotente: planos + tenant demo para explorar o schema localmente.
 * Credenciais demo (só desenvolvimento): dono@demo.local / SenhaDemo123!
 */
const prisma = new PrismaClient();

async function main() {
  const plans = [
    {
      code: PlanCode.STARTER,
      name: 'Starter',
      description: 'Para autônomos testando o fluxo de agenda',
      monthlyBookingLimit: 60,
      maxProfessionals: 1,
      whatsappReminders: false,
      pixDepositEnabled: false,
    },
    {
      code: PlanCode.PRO,
      name: 'Pro',
      description: 'Lembretes WhatsApp e sinal PIX (quando habilitados)',
      monthlyBookingLimit: 300,
      maxProfessionals: 1,
      whatsappReminders: true,
      pixDepositEnabled: true,
    },
    {
      code: PlanCode.BUSINESS,
      name: 'Business',
      description: 'Pequeno salão — até 5 profissionais (feature futura)',
      monthlyBookingLimit: null,
      maxProfessionals: 5,
      whatsappReminders: true,
      pixDepositEnabled: true,
    },
  ] as const;

  for (const plan of plans) {
    await prisma.planDefinition.upsert({
      where: { code: plan.code },
      create: { ...plan },
      update: {
        name: plan.name,
        description: plan.description,
        monthlyBookingLimit: plan.monthlyBookingLimit,
        maxProfessionals: plan.maxProfessionals,
        whatsappReminders: plan.whatsappReminders,
        pixDepositEnabled: plan.pixDepositEnabled,
      },
    });
  }

  const passwordHash = hashSync('SenhaDemo123!', 10);

  const tenant = await prisma.tenant.upsert({
    where: { slug: 'demo-barbearia' },
    create: {
      slug: 'demo-barbearia',
      name: 'Barbearia Demo',
      timezone: 'America/Sao_Paulo',
      plan: PlanCode.STARTER,
      subscription: {
        create: {
          plan: PlanCode.STARTER,
          status: SubscriptionStatus.TRIALING,
          monthlyBookingLimit: 60,
        },
      },
      users: {
        create: {
          email: 'dono@demo.local',
          passwordHash,
          name: 'João Barbeiro',
          phone: '+5511999990000',
          role: 'OWNER',
          timezone: 'America/Sao_Paulo',
        },
      },
      services: {
        create: [
          {
            name: 'Corte simples',
            description: 'Corte máquina + tesoura',
            durationMinutes: 30,
            priceCents: 4500,
            sortOrder: 1,
          },
          {
            name: 'Corte + barba',
            description: 'Combo clássico',
            durationMinutes: 50,
            priceCents: 7000,
            sortOrder: 2,
          },
        ],
      },
      availability: {
        create: [1, 2, 3, 4, 5].map((dayOfWeek) => ({
          dayOfWeek,
          startMinute: 9 * 60,
          endMinute: 18 * 60,
          isActive: true,
        })),
      },
    },
    update: {
      name: 'Barbearia Demo',
    },
    include: { users: true },
  });

  console.log(`Seed OK — tenant=${tenant.slug} users=${tenant.users.length}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
