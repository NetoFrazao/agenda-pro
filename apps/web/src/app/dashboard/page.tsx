'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Alert, EmptyState, PageTitle, Spinner } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type { Appointment, AuthUserPayload, Service } from '@/lib/types';

export default function DashboardOverviewPage() {
  const [me, setMe] = useState<AuthUserPayload | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const from = new Date();
        from.setHours(0, 0, 0, 0);
        const to = new Date(from);
        to.setDate(to.getDate() + 7);

        const [meData, servicesData, appointmentsData] = await Promise.all([
          api<AuthUserPayload>('/api/auth/me'),
          api<Service[]>('/api/services'),
          api<Appointment[]>(
            `/api/appointments?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`,
          ),
        ]);
        if (cancelled) return;
        setMe(meData);
        setServices(Array.isArray(servicesData) ? servicesData : []);
        setAppointments(Array.isArray(appointmentsData) ? appointmentsData : []);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Falha ao carregar o painel.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <Spinner />;
  if (error) return <Alert>{error}</Alert>;

  const publicUrl = me?.tenant?.slug ? `/u/${me.tenant.slug}` : null;
  const upcoming = appointments
    .filter((a) => a.status !== 'CANCELLED')
    .sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt))
    .slice(0, 5);

  return (
    <div>
      <PageTitle
        title={`Olá, ${me?.user?.name?.split(' ')[0] || 'profissional'}`}
        description="Resumo da sua agenda e atalhos rápidos."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg bg-white/80 p-5 ring-1 ring-stone-200">
          <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Negócio</p>
          <p className="mt-2 font-display text-xl text-stone-900">{me?.tenant?.name}</p>
          <p className="mt-1 text-sm text-stone-600">Plano {me?.tenant?.plan}</p>
        </div>
        <div className="rounded-lg bg-white/80 p-5 ring-1 ring-stone-200">
          <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Serviços</p>
          <p className="mt-2 font-display text-3xl text-stone-900">{services.length}</p>
          <Link
            href="/dashboard/services"
            className="mt-2 inline-block text-sm font-medium text-emerald-800 hover:underline"
          >
            Gerenciar
          </Link>
        </div>
        <div className="rounded-lg bg-white/80 p-5 ring-1 ring-stone-200">
          <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
            Próximos 7 dias
          </p>
          <p className="mt-2 font-display text-3xl text-stone-900">{upcoming.length}</p>
          <Link
            href="/dashboard/appointments"
            className="mt-2 inline-block text-sm font-medium text-emerald-800 hover:underline"
          >
            Ver agenda
          </Link>
        </div>
      </div>

      {publicUrl ? (
        <p className="mt-6 text-sm text-stone-600">
          Página pública:{' '}
          <Link href={publicUrl} className="font-semibold text-emerald-800 hover:underline">
            {publicUrl}
          </Link>
        </p>
      ) : null}

      <section className="mt-10">
        <h2 className="font-display text-xl font-semibold text-stone-900">Próximos agendamentos</h2>
        <div className="mt-4">
          {upcoming.length === 0 ? (
            <EmptyState>Nenhum agendamento nos próximos 7 dias.</EmptyState>
          ) : (
            <ul className="divide-y divide-stone-200 overflow-hidden rounded-lg bg-white ring-1 ring-stone-200">
              {upcoming.map((a) => (
                <li
                  key={a.id}
                  className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium text-stone-900">{a.client?.name || 'Cliente'}</p>
                    <p className="text-sm text-stone-600">{a.service?.name || 'Serviço'}</p>
                  </div>
                  <p className="text-sm text-stone-700">
                    {formatDateTime(a.startsAt, me?.tenant?.timezone)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
