'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  Field,
  Input,
  PageTitle,
  Select,
  Spinner,
} from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { APPOINTMENT_STATUS_LABEL, formatDateTime, type BadgeTone } from '@/lib/format';
import type {
  Appointment,
  AppointmentStatus,
  AuthUserPayload,
  PixChargeStatus,
  TeamMember,
} from '@/lib/types';

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

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function toInputDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default function AppointmentsPage() {
  const today = useMemo(() => startOfDay(new Date()), []);
  const [from, setFrom] = useState(toInputDate(today));
  const [to, setTo] = useState(() => {
    const t = new Date(today);
    t.setDate(t.getDate() + 14);
    return toInputDate(t);
  });
  const [professionalId, setProfessionalId] = useState('');
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [items, setItems] = useState<Appointment[]>([]);
  const [timezone, setTimezone] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  async function load(rangeFrom = from, rangeTo = to, filterProfessional = professionalId) {
    setError(null);
    const fromIso = new Date(`${rangeFrom}T00:00:00`).toISOString();
    const toIso = new Date(`${rangeTo}T23:59:59`).toISOString();
    const qs = new URLSearchParams({ from: fromIso, to: toIso });
    if (filterProfessional) qs.set('professionalId', filterProfessional);
    const [me, data] = await Promise.all([
      api<AuthUserPayload>('/api/auth/me'),
      api<Appointment[]>(`/api/appointments?${qs.toString()}`),
    ]);
    setTimezone(me.tenant?.timezone);
    setItems(Array.isArray(data) ? data : []);
  }

  useEffect(() => {
    void api<TeamMember[]>('/api/team')
      .then((data) => setTeam(Array.isArray(data) ? data : []))
      .catch(() => setTeam([]));
    void load()
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : 'Erro ao carregar agendamentos.'),
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

  async function updateStatus(id: string, status: AppointmentStatus) {
    setUpdatingId(id);
    setError(null);
    try {
      await api(`/api/appointments/${id}/status`, { method: 'PATCH', body: { status } });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível atualizar o status.');
    } finally {
      setUpdatingId(null);
    }
  }

  const sorted = [...items].sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt));
  const hasMultipleProfessionals = team.length > 1;

  return (
    <div>
      <PageTitle
        title="Agendamentos"
        description="Acompanhe e atualize o status dos horários marcados."
      />

      <div className="mb-6 flex flex-col gap-3 rounded-lg bg-white/80 p-4 ring-1 ring-stone-200 sm:flex-row sm:items-end">
        <Field label="De" id="from">
          <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="Até" id="to">
          <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
        {hasMultipleProfessionals ? (
          <Field label="Profissional" id="filter-professional">
            <Select
              id="filter-professional"
              value={professionalId}
              onChange={(e) => setProfessionalId(e.target.value)}
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
        <Button type="button" onClick={() => void applyFilter()} disabled={loading}>
          Filtrar
        </Button>
      </div>

      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      {loading ? (
        <Spinner />
      ) : sorted.length === 0 ? (
        <EmptyState>Nenhum agendamento neste período.</EmptyState>
      ) : (
        <ul className="space-y-3">
          {sorted.map((a) => {
            const pixBadge = a.pixCharge ? PIX_BADGE[a.pixCharge.status] : null;
            return (
              <li key={a.id} className="rounded-lg bg-white p-4 ring-1 ring-stone-200">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="flex flex-wrap items-center gap-2 font-semibold text-stone-900">
                      {a.client?.name || 'Cliente'}
                      {pixBadge ? <Badge tone={pixBadge.tone}>{pixBadge.label}</Badge> : null}
                    </p>
                    <p className="text-sm text-stone-600">
                      {a.service?.name || 'Serviço'} · {formatDateTime(a.startsAt, timezone)}
                      {hasMultipleProfessionals && a.professional?.name
                        ? ` · ${a.professional.name}`
                        : ''}
                    </p>
                    {a.client?.phone ? (
                      <p className="mt-1 text-sm text-stone-500">{a.client.phone}</p>
                    ) : null}
                    {a.customerNotes ? (
                      <p className="mt-2 text-sm text-stone-600">Obs.: {a.customerNotes}</p>
                    ) : null}
                  </div>
                  <div className="min-w-[12rem]">
                    <label htmlFor={`status-${a.id}`} className="sr-only">
                      Status do agendamento
                    </label>
                    <Select
                      id={`status-${a.id}`}
                      value={a.status}
                      disabled={updatingId === a.id}
                      onChange={(e) => void updateStatus(a.id, e.target.value as AppointmentStatus)}
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
          })}
        </ul>
      )}
    </div>
  );
}
