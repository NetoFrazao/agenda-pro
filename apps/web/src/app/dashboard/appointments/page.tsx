'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  Field,
  Input,
  PageTitle,
  Select,
  SkeletonList,
  StatusBadge,
} from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import {
  APPOINTMENT_STATUS_LABEL,
  addDaysYmd,
  formatDateTime,
  todayYmdInTimeZone,
  whatsappLink,
  zonedDayBoundsIso,
  type BadgeTone,
} from '@/lib/format';
import type {
  Appointment,
  AppointmentListResponse,
  AppointmentStatus,
  AppointmentStatusUpdateResult,
  PixChargeStatus,
  TeamMember,
} from '@/lib/types';

const PAGE_SIZE = 20;

const STATUS_OPTIONS: AppointmentStatus[] = [
  'SCHEDULED',
  'CONFIRMED',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
  'PENDING_PAYMENT',
];

const PIX_BADGE: Record<PixChargeStatus, { label: string; tone: BadgeTone }> = {
  PAID: { label: 'Sinal pago', tone: 'emerald' },
  PENDING: { label: 'Aguardando sinal', tone: 'amber' },
  EXPIRED: { label: 'Sinal expirado', tone: 'stone' },
  CANCELLED: { label: 'Sinal cancelado', tone: 'stone' },
};

type RebookingHint = {
  appointmentId: string;
  clientName: string;
  clientPhone: string;
  clientId?: string;
  message: string;
  serviceName?: string;
};

function AppointmentFilters({
  from,
  to,
  professionalId,
  team,
  loading,
  onFrom,
  onTo,
  onProfessional,
  onApply,
}: {
  from: string;
  to: string;
  professionalId: string;
  team: TeamMember[];
  loading: boolean;
  onFrom: (v: string) => void;
  onTo: (v: string) => void;
  onProfessional: (v: string) => void;
  onApply: () => void;
}) {
  const hasMultipleProfessionals = team.length > 1;
  return (
    <div className="surface-elevated mb-6 flex flex-col gap-3 rounded-2xl p-4 sm:flex-row sm:items-end">
      <Field label="De" id="from">
        <Input id="from" type="date" value={from} onChange={(e) => onFrom(e.target.value)} />
      </Field>
      <Field label="Até" id="to">
        <Input id="to" type="date" value={to} onChange={(e) => onTo(e.target.value)} />
      </Field>
      {hasMultipleProfessionals ? (
        <Field label="Profissional" id="filter-professional">
          <Select
            id="filter-professional"
            value={professionalId}
            onChange={(e) => onProfessional(e.target.value)}
          >
            <option value="">Todos</option>
            {team.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
      <Button type="button" onClick={onApply} loading={loading}>
        Filtrar
      </Button>
    </div>
  );
}

function RebookingBanner({
  hint,
  onDismiss,
}: {
  hint: RebookingHint;
  onDismiss: () => void;
}) {
  return (
    <div className="surface-elevated mb-4 flex flex-col gap-3 rounded-2xl p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-semibold text-ink">Sugestão de remarcação</p>
        <p className="mt-1 text-sm text-muted">
          {hint.message}
          {hint.serviceName ? ` (${hint.serviceName})` : ''} — {hint.clientName}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {hint.clientPhone ? (
          <a
            href={`${whatsappLink(hint.clientPhone)}?text=${encodeURIComponent(
              `Oi ${hint.clientName.split(' ')[0]}! Quer remarcar seu próximo horário${
                hint.serviceName ? ` de ${hint.serviceName}` : ''
              }?`,
            )}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-mint-deep px-4 py-2 text-sm font-semibold text-white transition hover:bg-mint-hover"
          >
            Remarcar no WhatsApp
          </a>
        ) : null}
        {hint.clientId ? (
          <a
            href="/dashboard/clients"
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-paper-2 bg-paper px-4 py-2 text-sm font-semibold text-ink transition hover:border-mint-deep/40"
          >
            Ver clientes
          </a>
        ) : null}
        <Button type="button" variant="ghost" onClick={onDismiss}>
          Dispensar
        </Button>
      </div>
    </div>
  );
}

function AppointmentCard({
  appointment: a,
  timezone,
  showProfessional,
  updating,
  onStatus,
}: {
  appointment: Appointment;
  timezone?: string;
  showProfessional: boolean;
  updating: boolean;
  onStatus: (id: string, status: AppointmentStatus) => void;
}) {
  const pixBadge = a.pixCharge ? PIX_BADGE[a.pixCharge.status] : null;
  return (
    <li className="surface-elevated rounded-2xl p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-ink">{a.client?.name || 'Cliente'}</p>
            <StatusBadge status={a.status} />
            {pixBadge ? <Badge tone={pixBadge.tone}>{pixBadge.label}</Badge> : null}
          </div>
          <p className="mt-1.5 text-sm text-muted">
            {a.service?.name || 'Serviço'} · {formatDateTime(a.startsAt, timezone)}
            {showProfessional && a.professional?.name ? ` · ${a.professional.name}` : ''}
          </p>
          {a.client?.phone ? (
            <p className="mt-1 text-sm text-ink-muted">{a.client.phone}</p>
          ) : null}
          {a.customerNotes ? (
            <p className="mt-2 text-sm text-muted">Obs.: {a.customerNotes}</p>
          ) : null}
        </div>
        <div className="w-full sm:min-w-[12rem] sm:max-w-[14rem]">
          <label
            htmlFor={`status-${a.id}`}
            className="mb-1.5 block text-xs font-medium text-muted"
          >
            Alterar status
          </label>
          <Select
            id={`status-${a.id}`}
            value={a.status}
            disabled={updating}
            onChange={(e) => onStatus(a.id, e.target.value as AppointmentStatus)}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {APPOINTMENT_STATUS_LABEL[s] || s}
              </option>
            ))}
          </Select>
        </div>
      </div>
    </li>
  );
}

export default function AppointmentsPage() {
  const { timezone, isMember } = useAuth();
  const tz = timezone;

  const defaults = useMemo(() => {
    const from = todayYmdInTimeZone(tz);
    return { from, to: addDaysYmd(from, 14) };
  }, [tz]);

  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);
  const [professionalId, setProfessionalId] = useState('');
  const [appliedFrom, setAppliedFrom] = useState(defaults.from);
  const [appliedTo, setAppliedTo] = useState(defaults.to);
  const [appliedProfessionalId, setAppliedProfessionalId] = useState('');
  const [page, setPage] = useState(1);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [items, setItems] = useState<Appointment[]>([]);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [rebookingHint, setRebookingHint] = useState<RebookingHint | null>(null);

  // Quando o fuso do tenant chega via AuthProvider, realinha defaults se ainda não filtrou.
  useEffect(() => {
    setFrom(defaults.from);
    setTo(defaults.to);
    setAppliedFrom(defaults.from);
    setAppliedTo(defaults.to);
  }, [defaults]);

  const load = useCallback(async () => {
    setError(null);
    const { fromIso } = zonedDayBoundsIso(appliedFrom, tz);
    const { toIso } = zonedDayBoundsIso(appliedTo, tz);
    const qs = new URLSearchParams({
      from: fromIso,
      to: toIso,
      page: String(page),
      pageSize: String(PAGE_SIZE),
    });
    if (appliedProfessionalId) qs.set('professionalId', appliedProfessionalId);
    const data = await api<AppointmentListResponse>(`/api/appointments?${qs.toString()}`);
    setItems(data.items ?? []);
    setTotal(data.total ?? 0);
    setPageSize(data.pageSize ?? PAGE_SIZE);
  }, [appliedFrom, appliedTo, appliedProfessionalId, page, tz]);

  useEffect(() => {
    if (isMember) return;
    void api<TeamMember[]>('/api/team')
      .then((data) => setTeam(Array.isArray(data) ? data : []))
      .catch(() => setTeam([]));
  }, [isMember]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void load()
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Erro ao carregar agendamentos.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  function applyFilter() {
    setAppliedFrom(from);
    setAppliedTo(to);
    setAppliedProfessionalId(professionalId);
    setPage(1);
  }

  async function updateStatus(id: string, status: AppointmentStatus) {
    setUpdatingId(id);
    setError(null);
    try {
      const current = items.find((a) => a.id === id);
      const result = await api<AppointmentStatusUpdateResult>(`/api/appointments/${id}/status`, {
        method: 'PATCH',
        body: { status },
      });
      if (status === 'COMPLETED' && result.rebookingSuggested && result.rebooking) {
        const phone = current?.client?.phone ?? '';
        setRebookingHint({
          appointmentId: id,
          clientName: current?.client?.name || 'Cliente',
          clientPhone: phone,
          clientId: result.rebooking.clientId || current?.client?.id,
          message: result.rebooking.message,
          serviceName: result.rebooking.serviceName,
        });
      } else if (rebookingHint?.appointmentId === id) {
        setRebookingHint(null);
      }
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível atualizar o status.');
    } finally {
      setUpdatingId(null);
    }
  }

  const sorted = [...items].sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt));
  const hasMultipleProfessionals = team.length > 1;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="animate-fade-up">
      <PageTitle
        title="Agenda"
        description={
          isMember
            ? 'Seus horários marcados (visão do profissional).'
            : 'Acompanhe e atualize o status dos horários marcados.'
        }
      />

      <AppointmentFilters
        from={from}
        to={to}
        professionalId={professionalId}
        team={isMember ? [] : team}
        loading={loading}
        onFrom={setFrom}
        onTo={setTo}
        onProfessional={setProfessionalId}
        onApply={applyFilter}
      />

      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      {rebookingHint ? (
        <RebookingBanner hint={rebookingHint} onDismiss={() => setRebookingHint(null)} />
      ) : null}

      {loading ? (
        <SkeletonList rows={5} />
      ) : sorted.length === 0 ? (
        <EmptyState
          title="Nenhum horário neste período"
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button type="button" variant="secondary" onClick={applyFilter}>
                Atualizar filtro
              </Button>
              <Link href="/dashboard">
                <Button type="button" variant="ghost">
                  Ir à visão geral
                </Button>
              </Link>
            </div>
          }
        >
          Ajuste as datas ou compartilhe o link público para receber novos agendamentos.
        </EmptyState>
      ) : (
        <>
          <ul className="space-y-3">
            {sorted.map((a) => (
              <AppointmentCard
                key={a.id}
                appointment={a}
                timezone={tz}
                showProfessional={hasMultipleProfessionals}
                updating={updatingId === a.id}
                onStatus={(id, status) => void updateStatus(id, status)}
              />
            ))}
          </ul>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted">
              {total} agendamento{total === 1 ? '' : 's'} · página {page} de {totalPages}
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Anterior
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={page >= totalPages || loading}
                onClick={() => setPage((p) => p + 1)}
              >
                Próxima
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
