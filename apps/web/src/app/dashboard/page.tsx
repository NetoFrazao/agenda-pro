'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  PageSkeleton,
  PageTitle,
  StatCard,
  StatusBadge,
} from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { formatBRL, formatDateTime } from '@/lib/format';
import type {
  Appointment,
  AppointmentListResponse,
  AuthUserPayload,
  ReportsSummary,
  Service,
} from '@/lib/types';

export default function DashboardOverviewPage() {
  const [me, setMe] = useState<AuthUserPayload | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [appointmentsTotal, setAppointmentsTotal] = useState(0);
  const [appointmentsTruncated, setAppointmentsTruncated] = useState(false);
  const [summary, setSummary] = useState<ReportsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const from = new Date();
        from.setHours(0, 0, 0, 0);
        const to = new Date(from);
        to.setDate(to.getDate() + 7);

        const [meData, servicesData, appointmentsData, summaryData] = await Promise.all([
          api<AuthUserPayload>('/api/auth/me'),
          api<Service[]>('/api/services'),
          api<AppointmentListResponse>(
            `/api/appointments?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}&page=1&pageSize=100`,
          ),
          api<ReportsSummary>('/api/reports/summary').catch(() => null),
        ]);
        if (cancelled) return;
        setMe(meData);
        setServices(Array.isArray(servicesData) ? servicesData : []);
        const items = appointmentsData.items ?? [];
        setAppointments(items);
        setAppointmentsTotal(appointmentsData.total ?? items.length);
        setAppointmentsTruncated((appointmentsData.total ?? 0) > items.length);
        setSummary(summaryData);
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

  if (loading) return <PageSkeleton />;
  if (error) return <Alert>{error}</Alert>;

  const publicUrl = me?.tenant?.slug ? `/u/${me.tenant.slug}` : null;
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const shareLink = publicUrl && origin ? `${origin}${publicUrl}` : publicUrl;

  const activeServices = services.filter((s) => s.isActive !== false);
  const needsOnboarding = activeServices.length === 0;

  const upcomingAll = appointments
    .filter((a) => a.status !== 'CANCELLED' && a.status !== 'NO_SHOW')
    .sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt));
  const upcomingPreview = upcomingAll.slice(0, 6);
  // Contagem honesta: total da API no período (não o slice da lista).
  // Se a página veio truncada, usamos total; senão contamos ativos na amostra completa.
  const upcomingWeekCount = appointmentsTruncated
    ? appointmentsTotal
    : upcomingAll.length;

  const todayKey = new Date().toDateString();
  const todayCount = appointments.filter(
    (a) => new Date(a.startsAt).toDateString() === todayKey && a.status !== 'CANCELLED',
  ).length;

  async function copyLink() {
    if (!shareLink) return;
    await navigator.clipboard.writeText(shareLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="animate-fade-up">
      <PageTitle
        title={`Olá, ${me?.user?.name?.split(' ')[0] || 'profissional'}`}
        description={`${me?.tenant?.name || 'Seu negócio'} · o que importa agora`}
        action={
          publicUrl ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={copyLink}>
                {copied ? 'Link copiado' : 'Copiar link público'}
              </Button>
              <Link href={publicUrl} target="_blank">
                <Button variant="dark" size="sm">
                  Ver página
                </Button>
              </Link>
            </div>
          ) : undefined
        }
      />

      {needsOnboarding ? (
        <div className="mb-8">
          <EmptyState
            title="Primeiro passo: criar um serviço"
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Link href="/dashboard/services">
                  <Button>Criar serviço</Button>
                </Link>
                {publicUrl ? (
                  <Link href={publicUrl} target="_blank">
                    <Button variant="secondary">Abrir /u/{me?.tenant?.slug}</Button>
                  </Link>
                ) : null}
              </div>
            }
          >
            Sem serviço ativo, sua página pública não recebe agendamentos. Crie o primeiro, depois
            abra o link e compartilhe no WhatsApp.
          </EmptyState>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard accent label="Hoje" value={todayCount} hint="agendamentos ativos" />
        <StatCard
          label="Próximos 7 dias"
          value={upcomingWeekCount}
          hint={
            appointmentsTruncated ? (
              <span>
                no período ·{' '}
                <Link
                  href="/dashboard/appointments"
                  className="font-medium text-mint-deep hover:underline"
                >
                  ver agenda
                </Link>
              </span>
            ) : (
              <Link
                href="/dashboard/appointments"
                className="font-medium text-mint-deep hover:underline"
              >
                Abrir agenda
              </Link>
            )
          }
        />
        <StatCard
          label="Faturamento do mês"
          value={formatBRL(summary?.totals.revenueCents ?? 0)}
          hint={`${summary?.totals.completed ?? 0} concluídos`}
        />
        <StatCard
          label="Serviços ativos"
          value={activeServices.length}
          hint={
            <Link href="/dashboard/services" className="font-medium text-mint-deep hover:underline">
              Gerenciar
            </Link>
          }
        />
      </div>

      {shareLink ? (
        <div className="surface-elevated mt-6 flex flex-col gap-3 rounded-2xl p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
              Seu link no bio / WhatsApp
            </p>
            <p className="mt-1 truncate font-mono text-sm text-ink">{shareLink}</p>
          </div>
          <Badge tone="emerald">Plano {me?.tenant?.plan}</Badge>
        </div>
      ) : null}

      <section className="mt-10">
        <div className="mb-4 flex items-end justify-between gap-3">
          <h2 className="font-display text-xl font-semibold text-ink">Próximos atendimentos</h2>
          <Link
            href="/dashboard/appointments"
            className="text-sm font-medium text-mint-deep hover:underline"
          >
            Ver todos
          </Link>
        </div>
        {upcomingPreview.length === 0 ? (
          <EmptyState
            title="Agenda livre"
            action={
              needsOnboarding ? (
                <Link href="/dashboard/services">
                  <Button variant="secondary">Criar serviço</Button>
                </Link>
              ) : publicUrl ? (
                <Link href={publicUrl} target="_blank">
                  <Button variant="secondary">Abrir página pública</Button>
                </Link>
              ) : undefined
            }
          >
            {needsOnboarding
              ? 'Crie um serviço e compartilhe seu link para receber o primeiro horário.'
              : 'Nenhum horário nos próximos 7 dias. Compartilhe seu link para encher a semana.'}
          </EmptyState>
        ) : (
          <ul className="surface-elevated divide-y divide-paper-2 overflow-hidden rounded-2xl">
            {upcomingPreview.map((a) => (
              <li
                key={a.id}
                className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-ink">{a.client?.name || 'Cliente'}</p>
                    <StatusBadge status={a.status} />
                  </div>
                  <p className="mt-1 text-sm text-muted">
                    {a.service?.name || 'Serviço'}
                    {a.professional?.name ? ` · ${a.professional.name}` : ''}
                  </p>
                </div>
                <p className="shrink-0 text-sm font-medium tabular-nums text-ink-soft">
                  {formatDateTime(a.startsAt, me?.tenant?.timezone)}
                </p>
              </li>
            ))}
          </ul>
        )}
        {upcomingAll.length > upcomingPreview.length || appointmentsTruncated ? (
          <p className="mt-3 text-sm text-muted">
            Lista mostra os próximos {upcomingPreview.length}
            {appointmentsTruncated
              ? ` · ${appointmentsTotal} no período (paginado)`
              : ` de ${upcomingAll.length} ativos`}
            .
          </p>
        ) : null}
      </section>
    </div>
  );
}
