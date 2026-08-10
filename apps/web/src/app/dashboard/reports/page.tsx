'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { Alert, Button, EmptyState, Field, Input, PageTitle, Spinner } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import {
  firstDayOfMonthYmdInTimeZone,
  formatBRL,
  formatPercent,
  todayYmdInTimeZone,
  zonedDayBoundsIso,
} from '@/lib/format';
import type { ReportsSummary } from '@/lib/types';

export default function ReportsPage() {
  const { timezone } = useAuth();
  const defaults = useMemo(
    () => ({
      from: firstDayOfMonthYmdInTimeZone(timezone),
      to: todayYmdInTimeZone(timezone),
    }),
    [timezone],
  );
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);
  const [data, setData] = useState<ReportsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setFrom(defaults.from);
    setTo(defaults.to);
  }, [defaults]);

  async function load(rangeFrom = from, rangeTo = to) {
    setError(null);
    const { fromIso } = zonedDayBoundsIso(rangeFrom, timezone);
    const { toIso } = zonedDayBoundsIso(rangeTo, timezone);
    const summary = await api<ReportsSummary>(
      `/api/reports/summary?from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`,
    );
    setData(summary);
  }

  useEffect(() => {
    void load(defaults.from, defaults.to)
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : 'Erro ao carregar o relatório.'),
      )
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaults.from, defaults.to, timezone]);

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
    <div className="animate-fade-up">
      <PageTitle
        title="Relatórios"
        description="Caixa e operação do período (receita só conta atendimentos concluídos)."
      />

      <div className="surface-elevated mb-6 flex flex-col gap-3 rounded-2xl p-4 sm:flex-row sm:items-end">
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
        <Spinner label="Carregando relatório…" />
      ) : !data || !totals ? (
        <EmptyState
          title="Sem dados no período"
          action={
            <Button type="button" variant="secondary" onClick={() => void applyFilter()}>
              Atualizar
            </Button>
          }
        >
          Amplie as datas ou conclua atendimentos na agenda para ver faturamento aqui.
        </EmptyState>
      ) : (
        <div className="space-y-10">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="surface-elevated rounded-2xl p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                Faturamento
              </p>
              <p className="mt-2 font-display text-2xl text-ink">
                {formatBRL(totals.revenueCents)}
              </p>
              <p className="mt-1 text-sm text-muted">{totals.completed} concluídos</p>
            </div>
            <div className="surface-elevated rounded-2xl p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                Ticket médio
              </p>
              <p className="mt-2 font-display text-2xl text-ink">
                {formatBRL(totals.avgTicketCents)}
              </p>
              <p className="mt-1 text-sm text-muted">por atendimento concluído</p>
            </div>
            <div className="surface-elevated rounded-2xl p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                Taxa de no-show
              </p>
              <p className="mt-2 font-display text-2xl text-ink">
                {formatPercent(totals.noShowRate)}
              </p>
              <p className="mt-1 text-sm text-muted">{totals.noShow} faltas</p>
            </div>
            <div className="surface-elevated rounded-2xl p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                Novos clientes
              </p>
              <p className="mt-2 font-display text-2xl text-ink">{totals.newClients}</p>
              <p className="mt-1 text-sm text-muted">no período</p>
            </div>
          </div>

          <p className="text-sm text-muted">
            {totals.appointments} agendamentos no período · {totals.completed} concluídos ·{' '}
            {totals.cancelled} cancelados · {totals.noShow} faltas
          </p>

          <section>
            <h2 className="font-display text-xl font-semibold text-ink">Top serviços</h2>
            {data.topServices.length === 0 ? (
              <div className="mt-4">
                <EmptyState
                  title="Sem serviços no topo"
                  action={
                    <Link href="/dashboard/appointments">
                      <Button variant="secondary">Abrir agenda</Button>
                    </Link>
                  }
                >
                  Conclua atendimentos no período para ranquear os serviços.
                </EmptyState>
              </div>
            ) : (
              <div className="mt-4 overflow-x-auto rounded-2xl bg-white ring-1 ring-line">
                <table className="w-full min-w-[28rem] text-left text-sm">
                  <thead>
                    <tr className="border-b border-line text-xs uppercase tracking-wide text-muted">
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
                  <tbody className="divide-y divide-paper-2">
                    {data.topServices.map((s) => (
                      <tr key={s.serviceId}>
                        <td className="px-4 py-3 font-medium text-ink">{s.name}</td>
                        <td className="px-4 py-3 text-ink-muted">{s.count}</td>
                        <td className="px-4 py-3 text-ink-muted">{formatBRL(s.revenueCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-ink">Por profissional</h2>
            {data.byProfessional.length === 0 ? (
              <div className="mt-4">
                <EmptyState title="Sem dados por profissional">
                  Conclua atendimentos no período para ver receita e comissão por pessoa.
                </EmptyState>
              </div>
            ) : (
              <div className="mt-4 overflow-x-auto rounded-2xl bg-white ring-1 ring-line">
                <table className="w-full min-w-[36rem] text-left text-sm">
                  <thead>
                    <tr className="border-b border-line text-xs uppercase tracking-wide text-muted">
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
                  <tbody className="divide-y divide-paper-2">
                    {data.byProfessional.map((p) => (
                      <tr key={p.professionalId}>
                        <td className="px-4 py-3 font-medium text-ink">{p.name}</td>
                        <td className="px-4 py-3 text-ink-muted">{p.completed}</td>
                        <td className="px-4 py-3 text-ink-muted">{formatBRL(p.revenueCents)}</td>
                        <td className="px-4 py-3 text-ink-muted">
                          {formatBRL(p.commissionCents)}{' '}
                          <span className="text-muted-soft">({p.commissionPercent}%)</span>
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
