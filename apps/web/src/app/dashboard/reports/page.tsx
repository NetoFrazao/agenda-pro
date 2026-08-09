'use client';

import { useEffect, useState } from 'react';
import { Alert, Button, EmptyState, Field, Input, PageTitle, Spinner } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { formatBRL, formatPercent } from '@/lib/format';
import type { ReportsSummary } from '@/lib/types';

function firstDayOfMonthYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function todayYmdLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function ReportsPage() {
  const [from, setFrom] = useState(firstDayOfMonthYmd());
  const [to, setTo] = useState(todayYmdLocal());
  const [data, setData] = useState<ReportsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load(rangeFrom = from, rangeTo = to) {
    setError(null);
    const fromIso = new Date(`${rangeFrom}T00:00:00`).toISOString();
    const toIso = new Date(`${rangeTo}T23:59:59`).toISOString();
    const summary = await api<ReportsSummary>(
      `/api/reports/summary?from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`,
    );
    setData(summary);
  }

  useEffect(() => {
    void load()
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : 'Erro ao carregar o relatório.'),
      )
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function applyFilter() {
    setLoading(true);
    try {
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao filtrar.');
    } finally {
      setLoading(false);
    }
  }

  const totals = data?.totals;

  return (
    <div>
      <PageTitle
        title="Relatórios"
        description="Resumo financeiro e operacional do período (receita considera atendimentos concluídos)."
      />

      <div className="mb-6 flex flex-col gap-3 rounded-lg bg-white/80 p-4 ring-1 ring-stone-200 sm:flex-row sm:items-end">
        <Field label="De" id="report-from">
          <Input
            id="report-from"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </Field>
        <Field label="Até" id="report-to">
          <Input id="report-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <Button type="button" onClick={() => void applyFilter()} disabled={loading}>
          Aplicar
        </Button>
      </div>

      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      {loading ? (
        <Spinner />
      ) : !data || !totals ? (
        <EmptyState>Sem dados para o período.</EmptyState>
      ) : (
        <div className="space-y-10">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg bg-white/80 p-5 ring-1 ring-stone-200">
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                Faturamento
              </p>
              <p className="mt-2 font-display text-2xl text-stone-900">
                {formatBRL(totals.revenueCents)}
              </p>
              <p className="mt-1 text-sm text-stone-600">{totals.completed} concluídos</p>
            </div>
            <div className="rounded-lg bg-white/80 p-5 ring-1 ring-stone-200">
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                Ticket médio
              </p>
              <p className="mt-2 font-display text-2xl text-stone-900">
                {formatBRL(totals.avgTicketCents)}
              </p>
              <p className="mt-1 text-sm text-stone-600">por atendimento concluído</p>
            </div>
            <div className="rounded-lg bg-white/80 p-5 ring-1 ring-stone-200">
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                Taxa de no-show
              </p>
              <p className="mt-2 font-display text-2xl text-stone-900">
                {formatPercent(totals.noShowRate)}
              </p>
              <p className="mt-1 text-sm text-stone-600">{totals.noShow} faltas</p>
            </div>
            <div className="rounded-lg bg-white/80 p-5 ring-1 ring-stone-200">
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                Novos clientes
              </p>
              <p className="mt-2 font-display text-2xl text-stone-900">{totals.newClients}</p>
              <p className="mt-1 text-sm text-stone-600">no período</p>
            </div>
          </div>

          <p className="text-sm text-stone-600">
            {totals.appointments} agendamentos no período · {totals.completed} concluídos ·{' '}
            {totals.cancelled} cancelados · {totals.noShow} faltas
          </p>

          <section>
            <h2 className="font-display text-xl font-semibold text-stone-900">Top serviços</h2>
            {data.topServices.length === 0 ? (
              <div className="mt-4">
                <EmptyState>Nenhum atendimento concluído no período.</EmptyState>
              </div>
            ) : (
              <div className="mt-4 overflow-x-auto rounded-lg bg-white ring-1 ring-stone-200">
                <table className="w-full min-w-[28rem] text-left text-sm">
                  <thead>
                    <tr className="border-b border-stone-200 text-xs uppercase tracking-wide text-stone-500">
                      <th scope="col" className="px-4 py-3 font-semibold">
                        Serviço
                      </th>
                      <th scope="col" className="px-4 py-3 font-semibold">
                        Atendimentos
                      </th>
                      <th scope="col" className="px-4 py-3 font-semibold">
                        Receita
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {data.topServices.map((s) => (
                      <tr key={s.serviceId}>
                        <td className="px-4 py-3 font-medium text-stone-900">{s.name}</td>
                        <td className="px-4 py-3 text-stone-700">{s.count}</td>
                        <td className="px-4 py-3 text-stone-700">{formatBRL(s.revenueCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-stone-900">Por profissional</h2>
            {data.byProfessional.length === 0 ? (
              <div className="mt-4">
                <EmptyState>Nenhum atendimento concluído no período.</EmptyState>
              </div>
            ) : (
              <div className="mt-4 overflow-x-auto rounded-lg bg-white ring-1 ring-stone-200">
                <table className="w-full min-w-[36rem] text-left text-sm">
                  <thead>
                    <tr className="border-b border-stone-200 text-xs uppercase tracking-wide text-stone-500">
                      <th scope="col" className="px-4 py-3 font-semibold">
                        Profissional
                      </th>
                      <th scope="col" className="px-4 py-3 font-semibold">
                        Concluídos
                      </th>
                      <th scope="col" className="px-4 py-3 font-semibold">
                        Receita
                      </th>
                      <th scope="col" className="px-4 py-3 font-semibold">
                        Comissão
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {data.byProfessional.map((p) => (
                      <tr key={p.professionalId}>
                        <td className="px-4 py-3 font-medium text-stone-900">{p.name}</td>
                        <td className="px-4 py-3 text-stone-700">{p.completed}</td>
                        <td className="px-4 py-3 text-stone-700">{formatBRL(p.revenueCents)}</td>
                        <td className="px-4 py-3 text-stone-700">
                          {formatBRL(p.commissionCents)}{' '}
                          <span className="text-stone-400">({p.commissionPercent}%)</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
