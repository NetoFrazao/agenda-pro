'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { SiteFooter, SiteHeader } from '@/components/SiteChrome';
import { Alert, EmptyState, Spinner } from '@/components/ui';
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
        <h1 className="font-display text-4xl font-semibold text-stone-900">Planos</h1>
        <p className="mt-3 max-w-2xl text-lg text-stone-600">
          Escolha o ritmo do seu negócio. Você pode começar e evoluir quando a agenda crescer.
        </p>

        {warning ? (
          <div className="mt-6">
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
              return (
                <li
                  key={plan.code}
                  className="flex flex-col rounded-lg bg-white/90 p-6 ring-1 ring-stone-200"
                >
                  <h2 className="font-display text-2xl font-semibold text-stone-900">
                    {plan.name}
                  </h2>
                  {price != null ? (
                    <p className="mt-3 text-3xl font-semibold text-emerald-800">
                      {formatBRL(price)}
                      <span className="text-base font-normal text-stone-500">/mês</span>
                    </p>
                  ) : null}
                  {plan.description ? (
                    <p className="mt-3 text-sm text-stone-600">{plan.description}</p>
                  ) : null}
                  <ul className="mt-5 flex-1 space-y-2 text-sm text-stone-600">
                    <li>
                      {plan.monthlyBookingLimit == null
                        ? 'Agendamentos ilimitados'
                        : `Até ${plan.monthlyBookingLimit} agendamentos/mês`}
                    </li>
                    {plan.whatsappReminders ? (
                      <li>Lembretes por WhatsApp</li>
                    ) : (
                      <li>Lembretes por e-mail</li>
                    )}
                    {plan.pixDepositEnabled ? <li>Sinal via PIX</li> : null}
                  </ul>
                  <Link
                    href="/register"
                    className="mt-6 inline-flex justify-center rounded-md bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800"
                  >
                    Começar
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
