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
  formatPercent,
  formatTime,
  todayYmdInTimeZone,
  ymdInTimeZone,
  zonedDayBoundsIso,
} from '@/lib/format';
import type { Appointment, AppointmentListResponse, ReportsSummary, Service } from '@/lib/types';

function AppointmentRow({
  appointment: a,
  timezone,
  timeOnly,
}: {
  appointment: Appointment;
  timezone?: string;
  timeOnly?: boolean;
}) {
  return (
    <li className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
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
        {timeOnly ? formatTime(a.startsAt, timezone) : formatDateTime(a.startsAt, timezone)}
      </p>
    </li>
  );
}

function UpcomingList({
  items,
  timezone,
  truncated,
  total,
  previewLen,
  needsOnboarding,
  publicUrl,
  timeOnly,
  emptyTitle,
  emptyBody,
}: {
  items: Appointment[];
  timezone?: string;
  truncated?: boolean;
  total?: number;
  previewLen?: number;
  needsOnboarding: boolean;
  publicUrl: string | null;
  timeOnly?: boolean;
  emptyTitle: string;
  emptyBody: string;
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        title={emptyTitle}
        action={
          needsOnboarding ? (
            <Link href="/dashboard/services">
              <Button variant="secondary">Criar serviço</Button>
            </Link>
          ) : publicUrl ? (
            <Link href={publicUrl} target="_blank">
              <Button variant="secondary">Abrir página pública</Button>
            </Link>
          ) : (
            <Link href="/dashboard/appointments">
              <Button variant="secondary">Ver agenda</Button>
            </Link>
          )
        }
      >
        {emptyBody}
      </EmptyState>
    );
  }

  return (
    <>
      <ul className="surface-elevated divide-y divide-paper-2 overflow-hidden rounded-2xl">
        {items.map((a) => (
          <AppointmentRow key={a.id} appointment={a} timezone={timezone} timeOnly={timeOnly} />
        ))}
      </ul>
      {truncated || (previewLen != null && previewLen > items.length) ? (
        <p className="mt-3 text-sm text-muted">
          Lista mostra os próximos {items.length}
          {truncated && total != null
            ? ` · ${total} no período (paginado)`
            : previewLen != null && previewLen > items.length
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
            `/api/appointments?from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}&page=1&pageSize=100&activeOnly=true`,
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
  if (error) {
    return (
      <div className="space-y-3">
        <Alert>{error}</Alert>
        <Button variant="secondary" size="sm" onClick={() => window.location.reload()}>
          Tentar de novo
        </Button>
      </div>
    );
  }

  const publicUrl = me?.tenant?.slug ? `/u/${me.tenant.slug}` : null;
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const shareLink = publicUrl && origin ? `${origin}${publicUrl}` : publicUrl;

  const activeServices = services.filter((s) => s.isActive !== false);
  const needsOnboarding = !isMember && activeServices.length === 0;

  const upcomingAll = appointments
    .filter((a) => a.status !== 'CANCELLED' && a.status !== 'NO_SHOW')
    .sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt));
  // Com activeOnly=true, `total` da API já exclui CANCELLED/NO_SHOW (mesmo critério do filtro local).
  const upcomingWeekCount = appointmentsTruncated ? appointmentsTotal : upcomingAll.length;

  const tz = timezone || me?.tenant?.timezone;
  const todayKey = todayYmdInTimeZone(tz);

  function isToday(a: Appointment) {
    try {
      return ymdInTimeZone(new Date(a.startsAt), tz || 'UTC') === todayKey;
    } catch {
      return new Date(a.startsAt).toDateString() === new Date().toDateString();
    }
  }

  const todayAppointments = upcomingAll.filter(isToday);
  const laterAppointments = upcomingAll.filter((a) => !isToday(a)).slice(0, 6);

  const monthAppointments = summary?.totals.appointments ?? 0;
  const monthCompleted = summary?.totals.completed ?? 0;
  const occupancyRate = monthAppointments > 0 ? monthCompleted / monthAppointments : 0;

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
        description={`${me?.tenant?.name || 'Seu negócio'} · agenda e caixa do dia`}
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
            Você vê só os seus horários. Clientes, relatórios e planos ficam com o dono da conta.
          </Alert>
        </div>
      ) : null}

      <section className="mt-2">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-semibold text-ink">Hoje</h2>
            <p className="mt-1 text-sm text-muted">
              {todayAppointments.length === 0
                ? 'Nenhum horário ativo ainda'
                : `${todayAppointments.length} horário${todayAppointments.length === 1 ? '' : 's'} na agenda`}
            </p>
          </div>
          <Link
            href="/dashboard/appointments"
            className="text-sm font-medium text-mint-deep hover:underline"
          >
            Abrir agenda
          </Link>
        </div>
        <UpcomingList
          items={todayAppointments}
          timezone={tz}
          needsOnboarding={needsOnboarding}
          publicUrl={publicUrl}
          timeOnly
          emptyTitle="Dia livre"
          emptyBody={
            needsOnboarding
              ? 'Crie um serviço e compartilhe o link para encher a agenda de hoje.'
              : 'Nada marcado para hoje. Compartilhe seu link ou abra a agenda da semana.'
          }
        />
      </section>

      <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard accent label="Hoje" value={todayAppointments.length} hint="horários ativos" />
        {!isMember ? (
          <StatCard
            label="Faturamento do mês"
            value={formatBRL(summary?.totals.revenueCents ?? 0)}
            hint={`${monthCompleted} concluídos`}
          />
        ) : (
          <StatCard label="Seu papel" value="Membro" hint="agenda própria" />
        )}
        {!isMember ? (
          <StatCard
            label="Ocupação do mês"
            value={formatPercent(occupancyRate, 0)}
            hint="concluídos / agendados"
          />
        ) : (
          <StatCard
            label="Próximos 7 dias"
            value={upcomingWeekCount}
            hint={
              <Link
                href="/dashboard/appointments"
                className="font-medium text-mint-deep hover:underline"
              >
                abrir agenda
              </Link>
            }
          />
        )}
        <StatCard
          label={!isMember ? 'Próximos 7 dias' : 'Serviços ativos'}
          value={!isMember ? upcomingWeekCount : activeServices.length}
          hint={
            !isMember ? (
              <Link
                href="/dashboard/appointments"
                className="font-medium text-mint-deep hover:underline"
              >
                {appointmentsTruncated ? 'ver agenda (ativos)' : 'ativos · abrir agenda'}
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
              Link para bio e WhatsApp
            </p>
            <p className="mt-1 truncate font-mono text-sm text-ink">{shareLink}</p>
          </div>
          <Badge tone="emerald">Plano {me?.tenant?.plan}</Badge>
        </div>
      ) : null}

      <section className="mt-10">
        <div className="mb-4 flex items-end justify-between gap-3">
          <h2 className="font-display text-xl font-semibold text-ink">Próximos dias</h2>
          <Link
            href="/dashboard/appointments"
            className="text-sm font-medium text-mint-deep hover:underline"
          >
            Ver todos
          </Link>
        </div>
        <UpcomingList
          items={laterAppointments}
          timezone={tz}
          truncated={appointmentsTruncated}
          total={appointmentsTotal}
          previewLen={upcomingAll.filter((a) => !isToday(a)).length}
          needsOnboarding={needsOnboarding}
          publicUrl={publicUrl}
          emptyTitle="Semana tranquila"
          emptyBody={
            needsOnboarding
              ? 'Crie um serviço e compartilhe seu link para receber o primeiro horário.'
              : 'Nada além de hoje nos próximos 7 dias. Compartilhe o link para encher a semana.'
          }
        />
      </section>
    </div>
  );
}
