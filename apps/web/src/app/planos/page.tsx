'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { SiteFooter, SiteHeader } from '@/components/SiteChrome';
import { Alert, Badge, Button, EmptyState, Spinner } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { formatBRL, PLAN_PRICE_PLACEHOLDERS } from '@/lib/format';
import type { PlanDefinition } from '@/lib/types';

/** Planos de referência quando a API ainda não responde. */
const FALLBACK_PLANS: PlanDefinition[] = [
  {
    code: 'STARTER',
    name: 'Starter',
    description: 'Para quem está começando a profissionalizar a agenda.',
    monthlyBookingLimit: 80,
    whatsappReminders: false,
    pixDepositEnabled: false,
    priceCentsMonthly: PLAN_PRICE_PLACEHOLDERS.STARTER,
  },
  {
    code: 'PRO',
    name: 'Pro',
    description: 'Mais volume e lembretes para reduzir faltas.',
    monthlyBookingLimit: 250,
    whatsappReminders: true,
    pixDepositEnabled: false,
    priceCentsMonthly: PLAN_PRICE_PLACEHOLDERS.PRO,
  },
  {
    code: 'BUSINESS',
    name: 'Business',
    description: 'Para operações maiores, com sinal e recursos avançados.',
    monthlyBookingLimit: null,
    whatsappReminders: true,
    pixDepositEnabled: true,
    priceCentsMonthly: PLAN_PRICE_PLACEHOLDERS.BUSINESS,
  },
];

export default function PlanosPage() {
  const [plans, setPlans] = useState<PlanDefinition[]>(FALLBACK_PLANS);
  const [loading, setLoading] = useState(true);
  const [warning, setWarning] = useState<string | null>(null);

  useEffect(() => {
    void api<PlanDefinition[]>('/api/billing/plans', { auth: false })
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setPlans(data);
        }
      })
      .catch((err) => {
        setWarning(
          err instanceof ApiError
            ? 'Exibindo valores de referência enquanto a API de planos está indisponível.'
            : 'Não foi possível carregar planos da API; usando referência local.',
        );
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-atmosphere">
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-12 sm:px-10">
        <div className="max-w-2xl">
          <h1 className="font-display text-4xl font-semibold tracking-tight text-ink">Planos</h1>
          <p className="mt-3 text-lg leading-relaxed text-muted">
            Escolha o ritmo do seu negócio. Você pode começar e evoluir quando a agenda crescer.
          </p>
        </div>

        {warning ? (
          <div className="mt-6 max-w-2xl">
            <Alert tone="info">{warning}</Alert>
          </div>
        ) : null}

        {loading ? (
          <div className="mt-10">
            <Spinner />
          </div>
        ) : plans.length === 0 ? (
          <div className="mt-10">
            <EmptyState>Nenhum plano disponível.</EmptyState>
          </div>
        ) : (
          <ul className="mt-10 grid gap-5 sm:grid-cols-3">
            {plans.map((plan) => {
              const price = plan.priceCentsMonthly ?? PLAN_PRICE_PLACEHOLDERS[plan.code] ?? null;
              const isFeatured = plan.code === 'PRO';
              return (
                <li
                  key={plan.code}
                  className={`flex flex-col rounded-2xl p-6 ${
                    isFeatured
                      ? 'bg-ink text-white shadow-[0_24px_48px_-24px_rgba(14,17,16,0.55)]'
                      : 'surface-elevated'
                  }`}
                >
                  {isFeatured ? <Badge tone="emerald">Mais popular</Badge> : null}
                  <h2
                    className={`mt-2 font-display text-2xl font-semibold ${isFeatured ? 'text-white' : 'text-ink'}`}
                  >
                    {plan.name}
                  </h2>
                  {price != null ? (
                    <p
                      className={`mt-3 font-display text-3xl font-semibold ${isFeatured ? 'text-mint-glow' : 'text-mint-deep'}`}
                    >
                      {formatBRL(price)}
                      <span
                        className={`text-base font-normal ${isFeatured ? 'text-white/65' : 'text-muted'}`}
                      >
                        /mês
                      </span>
                    </p>
                  ) : null}
                  {plan.description ? (
                    <p
                      className={`mt-3 text-sm leading-relaxed ${isFeatured ? 'text-white/70' : 'text-muted'}`}
                    >
                      {plan.description}
                    </p>
                  ) : null}
                  <ul
                    className={`mt-5 flex-1 space-y-2.5 text-sm ${isFeatured ? 'text-white/70' : 'text-muted'}`}
                  >
                    <li className="flex items-start gap-2">
                      <span className={isFeatured ? 'text-mint' : 'text-mint-deep'} aria-hidden>
                        ✓
                      </span>
                      {plan.monthlyBookingLimit == null
                        ? 'Agendamentos ilimitados'
                        : `Até ${plan.monthlyBookingLimit} agendamentos/mês`}
                    </li>
                    <li className="flex items-start gap-2">
                      <span className={isFeatured ? 'text-mint' : 'text-mint-deep'} aria-hidden>
                        ✓
                      </span>
                      {plan.whatsappReminders ? 'Lembretes por WhatsApp' : 'Lembretes por e-mail'}
                    </li>
                    {plan.pixDepositEnabled ? (
                      <li className="flex items-start gap-2">
                        <span className={isFeatured ? 'text-mint' : 'text-mint-deep'} aria-hidden>
                          ✓
                        </span>
                        Sinal via PIX
                      </li>
                    ) : null}
                  </ul>
                  <Link href="/register" className="mt-6 block">
                    <Button
                      fullWidth
                      variant={isFeatured ? 'primary' : 'secondary'}
                      className={isFeatured ? 'bg-mint text-ink hover:bg-mint-glow' : ''}
                    >
                      Começar
                    </Button>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
