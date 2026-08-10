'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { OnboardingWizard } from '@/components/OnboardingWizard';
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
import {
  addDaysYmd,
  formatBRL,
  formatDateTime,
  todayYmdInTimeZone,
  ymdInTimeZone,
  zonedDayBoundsIso,
} from '@/lib/format';
import type { Appointment, AppointmentListResponse, ReportsSummary, Service } from '@/lib/types';

function UpcomingList({
  items,
  timezone,
  truncated,
  total,
  previewLen,
  needsOnboarding,
  publicUrl,
}: {
  items: Appointment[];
  timezone?: string;
  truncated: boolean;
  total: number;
  previewLen: number;
  needsOnboarding: boolean;
  publicUrl: string | null;
}) {
  if (items.length === 0) {
    return (
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
    );
  }

  return (
    <>
      <ul className="surface-elevated divide-y divide-paper-2 overflow-hidden rounded-2xl">
        {items.map((a) => (
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
              {formatDateTime(a.startsAt, timezone)}
            </p>
          </li>
        ))}
      </ul>
      {truncated || previewLen > items.length ? (
        <p className="mt-3 text-sm text-muted">
          Lista mostra os próximos {items.length}
          {truncated
            ? ` · ${total} no período (paginado)`
            : previewLen > items.length
              ? ` de ${previewLen} ativos`
              : ''}
          .
        </p>
      ) : null}
    </>
  );
}

export default function DashboardOverviewPage() {
  const { me, timezone, isMember } = useAuth();
  const [services, setServices] = useState<Service[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [appointmentsTotal, setAppointmentsTotal] = useState(0);
  const [appointmentsTruncated, setAppointmentsTruncated] = useState(false);
  const [summary, setSummary] = useState<ReportsSummary | null>(null);
  const [hasAvailability, setHasAvailability] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const tz = timezone || me?.tenant?.timezone || undefined;
        const fromYmd = todayYmdInTimeZone(tz);
        const toYmd = addDaysYmd(fromYmd, 7);
        const { fromIso } = zonedDayBoundsIso(fromYmd, tz);
        const { toIso } = zonedDayBoundsIso(toYmd, tz);

        const [servicesData, appointmentsData, summaryData, rules] = await Promise.all([
          api<Service[]>('/api/services').catch(() => [] as Service[]),
          api<AppointmentListResponse>(
            `/api/appointments?from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}&page=1&pageSize=100`,
          ),
          isMember
            ? Promise.resolve(null)
            : api<ReportsSummary>('/api/reports/summary').catch(() => null),
          api<unknown[]>('/api/availability/rules').catch(() => [] as unknown[]),
        ]);
        if (cancelled) return;
        setServices(Array.isArray(servicesData) ? servicesData : []);
        const items = appointmentsData.items ?? [];
        setAppointments(items);
        setAppointmentsTotal(appointmentsData.total ?? items.length);
        setAppointmentsTruncated((appointmentsData.total ?? 0) > items.length);
        setSummary(summaryData);
        setHasAvailability(Array.isArray(rules) && rules.length > 0);
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
  }, [timezone, me?.tenant?.timezone, isMember]);

  if (loading) return <PageSkeleton />;
  if (error) return <Alert>{error}</Alert>;

  const publicUrl = me?.tenant?.slug ? `/u/${me.tenant.slug}` : null;
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const shareLink = publicUrl && origin ? `${origin}${publicUrl}` : publicUrl;

  const activeServices = services.filter((s) => s.isActive !== false);
  const needsOnboarding = !isMember && activeServices.length === 0;

  const upcomingAll = appointments
    .filter((a) => a.status !== 'CANCELLED' && a.status !== 'NO_SHOW')
    .sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt));
  const upcomingPreview = upcomingAll.slice(0, 6);
  const upcomingWeekCount = appointmentsTruncated ? appointmentsTotal : upcomingAll.length;

  const tz = timezone || me?.tenant?.timezone;
  const todayKey = todayYmdInTimeZone(tz);
  const todayCount = appointments.filter((a) => {
    if (a.status === 'CANCELLED') return false;
    try {
      return ymdInTimeZone(new Date(a.startsAt), tz || 'UTC') === todayKey;
    } catch {
      return new Date(a.startsAt).toDateString() === new Date().toDateString();
    }
  }).length;

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
          publicUrl && !isMember ? (
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

      {!isMember && (needsOnboarding || !hasAvailability) ? (
        <OnboardingWizard
          slug={me?.tenant?.slug}
          hasActiveService={activeServices.length > 0}
          hasAvailability={hasAvailability}
        />
      ) : null}

      {isMember ? (
        <div className="mb-6">
          <Alert tone="info">
            Você está vendo apenas os seus agendamentos. O CRM completo fica com o dono da conta.
          </Alert>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard accent label="Hoje" value={todayCount} hint="agendamentos ativos" />
        <StatCard
          label="Próximos 7 dias"
          value={upcomingWeekCount}
          hint={
            <Link
              href="/dashboard/appointments"
              className="font-medium text-mint-deep hover:underline"
            >
              {appointmentsTruncated ? 'ver agenda' : 'Abrir agenda'}
            </Link>
          }
        />
        {!isMember ? (
          <StatCard
            label="Faturamento do mês"
            value={formatBRL(summary?.totals.revenueCents ?? 0)}
            hint={`${summary?.totals.completed ?? 0} concluídos`}
          />
        ) : (
          <StatCard label="Seu papel" value="Membro" hint="agenda própria" />
        )}
        <StatCard
          label="Serviços ativos"
          value={activeServices.length}
          hint={
            !isMember ? (
              <Link href="/dashboard/services" className="font-medium text-mint-deep hover:underline">
                Gerenciar
              </Link>
            ) : (
              'da equipe'
            )
          }
        />
      </div>

      {shareLink && !isMember ? (
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
        <UpcomingList
          items={upcomingPreview}
          timezone={tz}
          truncated={appointmentsTruncated}
          total={appointmentsTotal}
          previewLen={upcomingAll.length}
          needsOnboarding={needsOnboarding}
          publicUrl={publicUrl}
        />
      </section>
    </div>
  );
}
