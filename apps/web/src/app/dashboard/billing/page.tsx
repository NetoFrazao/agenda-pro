'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { Alert, Button, EmptyState, PageTitle, Spinner } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { formatBRL, PLAN_PRICE_PLACEHOLDERS } from '@/lib/format';
import type { PlanCode, PlanDefinition } from '@/lib/types';

export default function BillingPage() {
  const { me, refresh } = useAuth();
  const [plans, setPlans] = useState<PlanDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const plansData = await api<PlanDefinition[]>('/api/billing/plans');
    setPlans(Array.isArray(plansData) ? plansData : []);
    await refresh();
  }

  useEffect(() => {
    void load()
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Erro ao carregar planos.'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  if (loading) return <Spinner label="Carregando planos…" />;

  const current = me?.tenant?.plan;

  return (
    <div className="animate-fade-up">
      <PageTitle
        title="Planos e cobrança"
        description="Escolha o plano do negócio. Preços vêm da API ou de valores de referência."
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

      <p className="mb-6 text-sm text-muted">
        Plano atual: <strong className="text-ink">{current || '—'}</strong>
      </p>

      {plans.length === 0 ? (
        <EmptyState
          title="Planos indisponíveis"
          action={
            <Button type="button" variant="secondary" onClick={() => window.location.reload()}>
              Tentar de novo
            </Button>
          }
        >
          Não foi possível listar os planos agora. Tente novamente em instantes.
        </EmptyState>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-3">
          {plans.map((plan) => {
            const price = plan.priceCentsMonthly ?? PLAN_PRICE_PLACEHOLDERS[plan.code] ?? null;
            const isCurrent = current === plan.code;
            return (
              <li
                key={plan.code}
                className="flex flex-col surface-elevated rounded-2xl p-5"
              >
                <h2 className="font-display text-xl font-semibold text-ink">{plan.name}</h2>
                {price != null ? (
                  <p className="mt-2 text-2xl font-semibold text-mint-deep">
                    {formatBRL(price)}
                    <span className="text-sm font-normal text-muted">/mês</span>
                  </p>
                ) : null}
                {plan.description ? (
                  <p className="mt-3 text-sm text-muted">{plan.description}</p>
                ) : null}
                <ul className="mt-4 flex-1 space-y-1 text-sm text-muted">
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
