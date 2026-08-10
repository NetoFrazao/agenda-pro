'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { BrandLogo } from '@/components/BrandLogo';
import { PixBlock } from '@/components/pix';
import { SlotListbox } from '@/components/SlotListbox';
import {
  Alert,
  Button,
  EmptyState,
  Field,
  Input,
  Spinner,
  Stars,
  StatusBadge,
  Textarea,
} from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { formatBRL, formatDate, formatDateTime, formatTime, todayYmd } from '@/lib/format';
import type { ManagedAppointment, PublicSlotsResponse } from '@/lib/types';

const ACTIVE_STATUSES = ['PENDING_PAYMENT', 'SCHEDULED', 'CONFIRMED'];

function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div role="radiogroup" aria-label="Nota de 1 a 5 estrelas" className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} estrela${n > 1 ? 's' : ''}`}
          onClick={() => onChange(n)}
          className={`text-3xl transition ${n <= value ? 'text-amber-500' : 'text-[#d5dbd6] hover:text-amber-400'}`}
        >
          ★
        </button>
      ))}
    </div>
  );
}

export default function ManageAppointmentPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const [data, setData] = useState<ManagedAppointment | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Cancelamento
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  // Remarcação
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [newDate, setNewDate] = useState(todayYmd());
  const [slots, setSlots] = useState<string[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [newSlot, setNewSlot] = useState<string | null>(null);

  // Avaliação
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');

  const load = useCallback(async () => {
    try {
      const detail = await api<ManagedAppointment>(`/api/public/appointments/${token}`, {
        auth: false,
      });
      setData(detail);
      setLoadError(null);
    } catch (err) {
      setLoadError(
        err instanceof ApiError && err.status === 404
          ? 'Agendamento não encontrado. Confira o link recebido.'
          : err instanceof ApiError
            ? err.message
            : 'Não foi possível carregar o agendamento.',
      );
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const timezone = data?.tenant?.timezone;

  const loadSlots = useCallback(
    async (date: string) => {
      if (!data) return;
      setSlotsLoading(true);
      setNewSlot(null);
      try {
        const res = await api<PublicSlotsResponse>(
          `/api/public/${data.tenant.slug}/slots?serviceId=${encodeURIComponent(data.service.id)}&date=${encodeURIComponent(date)}&professionalId=${encodeURIComponent(data.professional.id)}`,
          { auth: false },
        );
        setSlots(res.slots || []);
      } catch {
        setSlots([]);
      } finally {
        setSlotsLoading(false);
      }
    },
    [data],
  );

  useEffect(() => {
    if (rescheduleOpen && newDate) void loadSlots(newDate);
  }, [rescheduleOpen, newDate, loadSlots]);

  async function confirmPresence() {
    setBusy('confirm');
    setActionError(null);
    setActionSuccess(null);
    try {
      await api(`/api/public/appointments/${token}/confirm`, {
        method: 'POST',
        auth: false,
        body: {},
      });
      setActionSuccess('Presença confirmada. Até lá!');
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Não foi possível confirmar.');
    } finally {
      setBusy(null);
    }
  }

  async function cancelAppointment(e: FormEvent) {
    e.preventDefault();
    setBusy('cancel');
    setActionError(null);
    setActionSuccess(null);
    try {
      await api(`/api/public/appointments/${token}/cancel`, {
        method: 'POST',
        auth: false,
        body: { reason: cancelReason.trim() || undefined },
      });
      setActionSuccess('Agendamento cancelado.');
      setCancelOpen(false);
      await load();
    } catch (err) {
      // 400 = fora do prazo: exibimos a mensagem da API
      setActionError(err instanceof ApiError ? err.message : 'Não foi possível cancelar.');
    } finally {
      setBusy(null);
    }
  }

  async function reschedule() {
    if (!newSlot) return;
    setBusy('reschedule');
    setActionError(null);
    setActionSuccess(null);
    try {
      await api(`/api/public/appointments/${token}/reschedule`, {
        method: 'POST',
        auth: false,
        body: { startsAt: newSlot },
      });
      setActionSuccess('Horário remarcado com sucesso.');
      setRescheduleOpen(false);
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setActionError('Esse horário acabou de ficar indisponível. Escolha outro.');
        await loadSlots(newDate);
      } else {
        setActionError(err instanceof ApiError ? err.message : 'Não foi possível remarcar.');
      }
    } finally {
      setBusy(null);
    }
  }

  async function submitReview(e: FormEvent) {
    e.preventDefault();
    if (rating < 1) {
      setActionError('Escolha uma nota de 1 a 5 estrelas.');
      return;
    }
    setBusy('review');
    setActionError(null);
    setActionSuccess(null);
    try {
      await api(`/api/public/appointments/${token}/review`, {
        method: 'POST',
        auth: false,
        body: { rating, comment: comment.trim() || undefined },
      });
      setActionSuccess('Avaliação enviada. Obrigado!');
      await load();
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : 'Não foi possível enviar a avaliação.',
      );
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-atmosphere p-6">
        <Spinner label="Carregando agendamento…" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-screen flex-col bg-atmosphere">
        <div className="px-6 py-6">
          <BrandLogo />
        </div>
        <main className="mx-auto w-full max-w-lg px-6 py-16">
          <Alert>{loadError || 'Agendamento não encontrado.'}</Alert>
        </main>
      </div>
    );
  }

  const isActive = ACTIVE_STATUSES.includes(data.status);
  const showPix = data.pixCharge !== null && data.pixCharge.status === 'PENDING';

  return (
    <div className="flex min-h-screen flex-col bg-atmosphere">
      <header className="glass-panel border-b border-line/60 px-6 py-6">
        <div className="mx-auto flex max-w-2xl items-start justify-between gap-4">
          <div>
            <p className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              {data.tenant.name}
            </p>
            <p className="mt-1 text-sm text-muted">Meu agendamento</p>
          </div>
          <BrandLogo href="/" size="sm" className="shrink-0 opacity-60" />
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 space-y-5 px-6 py-8">
        {actionError ? <Alert>{actionError}</Alert> : null}
        {actionSuccess ? <Alert tone="success">{actionSuccess}</Alert> : null}

        <section aria-label="Detalhes do agendamento" className="surface-elevated rounded-2xl p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h1 className="font-display text-xl font-semibold text-ink">{data.service.name}</h1>
            <StatusBadge status={data.status} />
          </div>
          <dl className="mt-5 space-y-4 text-sm">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted">
                Quando
              </dt>
              <dd className="mt-1 font-medium text-ink">
                {formatDate(data.startsAt, timezone)} às {formatTime(data.startsAt, timezone)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted">
                Profissional
              </dt>
              <dd className="mt-1 font-medium text-ink">{data.professional.name}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted">
                Cliente
              </dt>
              <dd className="mt-1 font-medium text-ink">{data.client.name}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted">
                Valor
              </dt>
              <dd className="mt-1 font-display text-lg font-semibold text-mint-deep">
                {formatBRL(data.priceCentsSnapshot)}
              </dd>
            </div>
            {data.tenant.address ? (
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Endereço
                </dt>
                <dd className="mt-1 font-medium text-ink">{data.tenant.address}</dd>
              </div>
            ) : null}
          </dl>
        </section>

        {showPix && data.pixCharge ? (
          <PixBlock
            amountCents={data.pixCharge.amountCents}
            copyPaste={data.pixCharge.copyPaste}
            qrCodeBase64={data.pixCharge.qrCodeBase64}
            expiresAt={data.pixCharge.expiresAt}
            timezone={timezone}
            note="Seu horário só é confirmado após o pagamento do sinal."
          />
        ) : null}

        {isActive ? (
          <section aria-label="Ações" className="surface-elevated rounded-2xl p-6">
            <h2 className="font-display text-lg font-semibold text-ink">Precisa mudar algo?</h2>
            {data.canCancel ? (
              <p className="mt-2 text-sm text-muted">
                Cancelamento e remarcação gratuitos até{' '}
                <strong className="text-ink">
                  {formatDateTime(data.canCancelUntil, timezone)}
                </strong>
                .
              </p>
            ) : (
              <p className="mt-2 text-sm text-muted">
                O prazo para cancelar ou remarcar online já passou ({data.tenant.cancelMinHours}h
                antes do horário). Fale direto com o estabelecimento.
              </p>
            )}

            <div className="mt-5 flex flex-wrap gap-2">
              {data.status === 'SCHEDULED' ? (
                <Button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void confirmPresence()}
                >
                  {busy === 'confirm' ? 'Confirmando…' : 'Confirmar presença'}
                </Button>
              ) : null}
              {data.canCancel ? (
                <>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busy !== null}
                    onClick={() => {
                      setRescheduleOpen((v) => !v);
                      setCancelOpen(false);
                    }}
                  >
                    Remarcar horário
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    disabled={busy !== null}
                    onClick={() => {
                      setCancelOpen((v) => !v);
                      setRescheduleOpen(false);
                    }}
                  >
                    Cancelar agendamento
                  </Button>
                </>
              ) : null}
            </div>

            {cancelOpen ? (
              <form
                onSubmit={cancelAppointment}
                className="mt-5 space-y-4 rounded-xl bg-paper-2 p-5 ring-1 ring-line"
              >
                <Field label="Motivo (opcional)" id="cancel-reason">
                  <Textarea
                    id="cancel-reason"
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    maxLength={255}
                  />
                </Field>
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" variant="danger" disabled={busy !== null}>
                    {busy === 'cancel' ? 'Cancelando…' : 'Confirmar cancelamento'}
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setCancelOpen(false)}>
                    Voltar
                  </Button>
                </div>
              </form>
            ) : null}

            {rescheduleOpen ? (
              <div className="mt-5 space-y-4 rounded-xl bg-paper-2 p-5 ring-1 ring-line">
                <div className="max-w-xs">
                  <Field label="Nova data" id="new-date">
                    <Input
                      id="new-date"
                      type="date"
                      min={todayYmd()}
                      value={newDate}
                      onChange={(e) => setNewDate(e.target.value)}
                    />
                  </Field>
                </div>
                {slotsLoading ? (
                  <Spinner label="Buscando horários…" />
                ) : slots.length === 0 ? (
                  <EmptyState>Nenhum horário livre neste dia. Tente outra data.</EmptyState>
                ) : (
                  <SlotListbox
                    slots={slots}
                    value={newSlot}
                    onChange={setNewSlot}
                    timezone={timezone}
                    label="Novos horários disponíveis"
                    className="grid grid-cols-3 gap-2 sm:grid-cols-4"
                  />
                )}
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    disabled={!newSlot || busy !== null}
                    onClick={() => void reschedule()}
                  >
                    {busy === 'reschedule' ? 'Remarcando…' : 'Confirmar novo horário'}
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setRescheduleOpen(false)}>
                    Voltar
                  </Button>
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        {data.review ? (
          <section aria-label="Sua avaliação" className="surface-elevated rounded-2xl p-6">
            <h2 className="font-display text-lg font-semibold text-ink">Sua avaliação</h2>
            <div className="mt-3">
              <Stars value={data.review.rating} size="lg" />
              {data.review.comment ? (
                <p className="mt-2 text-sm leading-relaxed text-ink-muted">{data.review.comment}</p>
              ) : null}
            </div>
          </section>
        ) : data.canReview ? (
          <section aria-label="Avaliar atendimento" className="surface-elevated rounded-2xl p-6">
            <h2 className="font-display text-lg font-semibold text-ink">
              Como foi seu atendimento?
            </h2>
            <form onSubmit={submitReview} className="mt-5 space-y-4">
              <StarPicker value={rating} onChange={setRating} />
              <Field label="Comentário (opcional)" id="review-comment">
                <Textarea
                  id="review-comment"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  maxLength={500}
                />
              </Field>
              <Button type="submit" disabled={busy !== null || rating < 1}>
                {busy === 'review' ? 'Enviando…' : 'Enviar avaliação'}
              </Button>
            </form>
          </section>
        ) : null}
      </main>
    </div>
  );
}
