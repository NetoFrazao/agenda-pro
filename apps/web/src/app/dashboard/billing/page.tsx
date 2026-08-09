'use client';

import { useEffect, useState } from 'react';
import { Alert, Button, EmptyState, PageTitle, Spinner } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { formatBRL, PLAN_PRICE_PLACEHOLDERS } from '@/lib/format';
import type { AuthUserPayload, PlanCode, PlanDefinition } from '@/lib/types';

export default function BillingPage() {
  const [plans, setPlans] = useState<PlanDefinition[]>([]);
  const [me, setMe] = useState<AuthUserPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const [plansData, meData] = await Promise.all([
      api<PlanDefinition[]>('/api/billing/plans'),
      api<AuthUserPayload>('/api/auth/me'),
    ]);
    setPlans(Array.isArray(plansData) ? plansData : []);
    setMe(meData);
  }

  useEffect(() => {
    void load()
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Erro ao carregar planos.'))
      .finally(() => setLoading(false));
  }, []);

  async function checkout(plan: PlanCode) {
    setBusy(plan);
    setError(null);
    setMessage(null);
    try {
      const res = await api<{ url?: string; checkoutUrl?: string }>('/api/billing/checkout', {
        method: 'POST',
        body: { plan },
      });
      const url = res.url || res.checkoutUrl;
      if (url) {
        window.location.href = url;
        return;
      }
      setMessage(
        'Checkout iniciado. Se houver URL de pagamento, ela será redirecionada automaticamente.',
      );
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível iniciar o checkout.');
    } finally {
      setBusy(null);
    }
  }

  async function cancel() {
    if (!confirm('Cancelar a assinatura ao fim do período atual?')) return;
    setBusy('cancel');
    setError(null);
    try {
      await api('/api/billing/cancel', { method: 'POST' });
      setMessage('Cancelamento solicitado.');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível cancelar.');
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <Spinner />;

  const current = me?.tenant?.plan;

  return (
    <div>
      <PageTitle
        title="Planos e cobrança"
        description="Escolha o plano do seu negócio. Os preços podem vir da API ou de valores de referência."
      />
      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}
      {message ? (
        <div className="mb-4">
          <Alert tone="success">{message}</Alert>
        </div>
      ) : null}

      <p className="mb-6 text-sm text-stone-600">
        Plano atual: <strong>{current || '—'}</strong>
      </p>

      {plans.length === 0 ? (
        <EmptyState>Nenhum plano disponível no momento.</EmptyState>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-3">
          {plans.map((plan) => {
            const price = plan.priceCentsMonthly ?? PLAN_PRICE_PLACEHOLDERS[plan.code] ?? null;
            const isCurrent = current === plan.code;
            return (
              <li
                key={plan.code}
                className="flex flex-col rounded-lg bg-white p-5 ring-1 ring-stone-200"
              >
                <h2 className="font-display text-xl font-semibold text-stone-900">{plan.name}</h2>
                {price != null ? (
                  <p className="mt-2 text-2xl font-semibold text-emerald-800">
                    {formatBRL(price)}
                    <span className="text-sm font-normal text-stone-500">/mês</span>
                  </p>
                ) : null}
                {plan.description ? (
                  <p className="mt-3 text-sm text-stone-600">{plan.description}</p>
                ) : null}
                <ul className="mt-4 flex-1 space-y-1 text-sm text-stone-600">
                  {plan.monthlyBookingLimit != null ? (
                    <li>
                      {plan.monthlyBookingLimit === null
                        ? 'Agendamentos ilimitados'
                        : `Até ${plan.monthlyBookingLimit} agendamentos/mês`}
                    </li>
                  ) : (
                    <li>Limite conforme o plano</li>
                  )}
                  {plan.whatsappReminders ? <li>Lembretes WhatsApp</li> : null}
                  {plan.pixDepositEnabled ? <li>Sinal via PIX</li> : null}
                </ul>
                <Button
                  className="mt-6"
                  fullWidth
                  disabled={isCurrent || busy === plan.code}
                  onClick={() => void checkout(plan.code)}
                >
                  {isCurrent ? 'Plano atual' : busy === plan.code ? 'Abrindo…' : 'Assinar'}
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-10">
        <Button
          type="button"
          variant="secondary"
          disabled={busy === 'cancel'}
          onClick={() => void cancel()}
        >
          {busy === 'cancel' ? 'Cancelando…' : 'Cancelar assinatura'}
        </Button>
      </div>
    </div>
  );
}
