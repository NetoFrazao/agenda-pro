'use client';

import { FormEvent, useCallback, useEffect, useState, type KeyboardEvent } from 'react';
import { useParams } from 'next/navigation';
import {
  Alert,
  BrandLogo,
  Button,
  EmptyState,
  Field,
  Input,
  Modal,
  PixBlock,
  Skeleton,
  SlotListbox,
  Stars,
  StatusBadge,
  Textarea,
  useToast,
} from '@/components';
import { Calendar, CheckCircle2, Clock, MapPin, Star, User } from '@/components/icons';
import { api, ApiError } from '@/lib/api';
import { formatBRL, formatDate, formatDateTime, formatTime, todayYmd } from '@/lib/format';
import type { ManagedAppointment, PublicSlotsResponse } from '@/lib/types';

const ACTIVE_STATUSES = ['PENDING_PAYMENT', 'SCHEDULED', 'CONFIRMED'];
const STAR_VALUES = [1, 2, 3, 4, 5] as const;

/** Radiogroup com roving tabindex + setas (padrão ARIA). */
function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const active = value >= 1 && value <= 5 ? value : 1;

  function focusStar(n: number) {
    const clamped = Math.max(1, Math.min(5, n));
    document.getElementById(`star-rating-${clamped}`)?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, n: number) {
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowUp':
        e.preventDefault();
        focusStar(n + 1);
        break;
      case 'ArrowLeft':
      case 'ArrowDown':
        e.preventDefault();
        focusStar(n - 1);
        break;
      case 'Home':
        e.preventDefault();
        focusStar(1);
        break;
      case 'End':
        e.preventDefault();
        focusStar(5);
        break;
      case ' ':
      case 'Enter':
        e.preventDefault();
        onChange(n);
        break;
      default:
        break;
    }
  }

  return (
    <div role="radiogroup" aria-label="Nota de 1 a 5 estrelas" className="flex flex-wrap gap-1">
      {STAR_VALUES.map((n) => (
        <button
          key={n}
          id={`star-rating-${n}`}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} estrela${n > 1 ? 's' : ''}`}
          tabIndex={n === active ? 0 : -1}
          onClick={() => onChange(n)}
          onKeyDown={(e) => onKeyDown(e, n)}
          className={`focus-ring touch-target inline-flex items-center justify-center rounded-xl transition ${
            n <= value ? 'text-brass' : 'text-muted hover:text-brass'
          }`}
        >
          <Star
            className="size-8"
            aria-hidden
            fill={n <= value ? 'currentColor' : 'none'}
            strokeWidth={1.75}
          />
        </button>
      ))}
    </div>
  );
}

function ManageLoadingSkeleton() {
  return (
    <div className="flex min-h-screen flex-col bg-atmosphere">
      <header className="border-b border-line/60 px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-2xl space-y-3">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-36" />
        </div>
      </header>
      <main className="mx-auto w-full max-w-2xl flex-1 space-y-4 px-4 py-8 sm:px-6">
        <Skeleton className="h-48 w-full rounded-2xl" />
        <Skeleton className="h-32 w-full rounded-2xl" />
      </main>
    </div>
  );
}

function SlotsSkeleton() {
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4" role="status" aria-label="Carregando horários">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-11 w-full rounded-xl" />
      ))}
      <span className="sr-only">Buscando horários…</span>
    </div>
  );
}

export default function ManageAppointmentPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const toast = useToast();

  const [data, setData] = useState<ManagedAppointment | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [busy, setBusy] = useState<string | null>(null);

  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [newDate, setNewDate] = useState(todayYmd());
  const [slots, setSlots] = useState<string[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [newSlot, setNewSlot] = useState<string | null>(null);

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
          ? 'Não encontramos esse agendamento. Confira o link que você recebeu.'
          : err instanceof ApiError
            ? err.message
            : 'Não foi possível carregar seu horário.',
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
        const res = await api<string[] | PublicSlotsResponse>(
          `/api/public/${data.tenant.slug}/slots?serviceId=${encodeURIComponent(data.service.id)}&date=${encodeURIComponent(date)}&professionalId=${encodeURIComponent(data.professional.id)}`,
          { auth: false },
        );
        setSlots(Array.isArray(res) ? res : res.slots || []);
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
    try {
      await api(`/api/public/appointments/${token}/confirm`, {
        method: 'POST',
        auth: false,
        body: {},
      });
      toast.success('Presença confirmada', 'Te esperamos no horário marcado.');
      await load();
    } catch (err) {
      toast.error(
        'Não deu para confirmar',
        err instanceof ApiError ? err.message : 'Tente de novo em instantes.',
      );
    } finally {
      setBusy(null);
    }
  }

  async function cancelAppointment(e: FormEvent) {
    e.preventDefault();
    setBusy('cancel');
    try {
      await api(`/api/public/appointments/${token}/cancel`, {
        method: 'POST',
        auth: false,
        body: { reason: cancelReason.trim() || undefined },
      });
      toast.success('Agendamento cancelado', 'Se mudar de ideia, é só marcar de novo.');
      setCancelOpen(false);
      await load();
    } catch (err) {
      toast.error(
        'Não deu para cancelar',
        err instanceof ApiError ? err.message : 'Fale com o estabelecimento se precisar.',
      );
    } finally {
      setBusy(null);
    }
  }

  async function reschedule() {
    if (!newSlot) return;
    setBusy('reschedule');
    try {
      await api(`/api/public/appointments/${token}/reschedule`, {
        method: 'POST',
        auth: false,
        body: { startsAt: newSlot },
      });
      toast.success('Horário remarcado', 'Seu novo horário já está guardado.');
      setRescheduleOpen(false);
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        toast.error('Horário ocupado', 'Esse horário acabou de ficar indisponível. Escolha outro.');
        await loadSlots(newDate);
      } else {
        toast.error(
          'Não deu para remarcar',
          err instanceof ApiError ? err.message : 'Tente outro horário.',
        );
      }
    } finally {
      setBusy(null);
    }
  }

  async function submitReview(e: FormEvent) {
    e.preventDefault();
    if (rating < 1) {
      toast.error('Falta a nota', 'Escolha de 1 a 5 estrelas.');
      return;
    }
    setBusy('review');
    try {
      await api(`/api/public/appointments/${token}/review`, {
        method: 'POST',
        auth: false,
        body: { rating, comment: comment.trim() || undefined },
      });
      toast.success('Obrigado pelo feedback!', 'Sua avaliação ajuda outros clientes.');
      await load();
    } catch (err) {
      toast.error(
        'Não deu para enviar',
        err instanceof ApiError ? err.message : 'Tente novamente.',
      );
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return <ManageLoadingSkeleton />;
  }

  if (!data) {
    return (
      <div className="flex min-h-screen flex-col bg-atmosphere">
        <div className="px-4 py-6 sm:px-6">
          <BrandLogo />
        </div>
        <main className="mx-auto w-full max-w-lg px-4 py-16 sm:px-6">
          <Alert>{loadError || 'Agendamento não encontrado.'}</Alert>
        </main>
      </div>
    );
  }

  const isActive = ACTIVE_STATUSES.includes(data.status);
  const showPix = data.pixCharge !== null && data.pixCharge.status === 'PENDING';
  const firstName = data.client.name.trim().split(/\s+/)[0] || 'você';

  return (
    <div className="flex min-h-screen flex-col bg-atmosphere">
      <header className="border-b border-line/60 bg-gradient-to-b from-paper via-paper to-atmosphere px-4 py-6 sm:px-6">
        <div className="mx-auto flex max-w-2xl items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-mint-deep">Oi, {firstName}</p>
            <p className="mt-1 font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Seu agendamento com {data.tenant.name}
            </p>
            <p className="mt-1 text-sm text-muted">Confirme, remarque ou cancele por aqui</p>
          </div>
          <BrandLogo href="/" size="sm" className="shrink-0 opacity-60" />
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 space-y-5 px-4 py-6 sm:px-6 sm:py-8">
        <section
          aria-label="Detalhes do agendamento"
          className="overflow-hidden rounded-3xl bg-gradient-to-br from-success-bg/70 via-white to-paper p-5 ring-1 ring-line/70 sm:p-6"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Serviço</p>
              <h1 className="mt-1 font-display text-xl font-semibold text-ink sm:text-2xl">
                {data.service.name}
              </h1>
            </div>
            <StatusBadge status={data.status} />
          </div>

          <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
            <div className="flex gap-3">
              <span className="mt-0.5 inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-white ring-1 ring-line">
                <Calendar className="size-5 text-mint-deep" aria-hidden />
              </span>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Quando</dt>
                <dd className="mt-1 font-medium text-ink">
                  {formatDate(data.startsAt, timezone)}
                </dd>
                <dd className="text-muted">às {formatTime(data.startsAt, timezone)}</dd>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="mt-0.5 inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-white ring-1 ring-line">
                <User className="size-5 text-mint-deep" aria-hidden />
              </span>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Profissional
                </dt>
                <dd className="mt-1 font-medium text-ink">{data.professional.name}</dd>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="mt-0.5 inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-white ring-1 ring-line">
                <Clock className="size-5 text-mint-deep" aria-hidden />
              </span>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Valor</dt>
                <dd className="mt-1 font-display text-lg font-semibold text-mint-deep">
                  {formatBRL(data.priceCentsSnapshot)}
                </dd>
              </div>
            </div>
            {data.tenant.address ? (
              <div className="flex gap-3">
                <span className="mt-0.5 inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-white ring-1 ring-line">
                  <MapPin className="size-5 text-mint-deep" aria-hidden />
                </span>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-muted">
                    Endereço
                  </dt>
                  <dd className="mt-1 font-medium text-ink">{data.tenant.address}</dd>
                </div>
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
            note="Seu agendamento só fica confirmado depois do pagamento do sinal."
          />
        ) : null}

        {isActive ? (
          <section
            aria-label="Ações"
            className="surface-elevated rounded-2xl p-5 sm:p-6"
          >
            <h2 className="font-display text-lg font-semibold text-ink">Precisa mudar algo?</h2>
            {data.canCancel ? (
              <p className="mt-2 text-sm text-muted">
                Cancelamento e remarcação sem custo até{' '}
                <strong className="text-ink">
                  {formatDateTime(data.canCancelUntil, timezone)}
                </strong>
                .
              </p>
            ) : (
              <p className="mt-2 text-sm text-muted">
                O prazo online para cancelar ou remarcar já passou ({data.tenant.cancelMinHours}h
                antes). Fale direto com {data.tenant.name}.
              </p>
            )}

            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              {data.status === 'SCHEDULED' ? (
                <Button
                  type="button"
                  disabled={busy !== null}
                  loading={busy === 'confirm'}
                  onClick={() => void confirmPresence()}
                  className="sm:min-w-[11rem]"
                >
                  <CheckCircle2 className="size-4" aria-hidden />
                  Confirmar presença
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
                    Remarcar
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
                    Cancelar
                  </Button>
                </>
              ) : null}
            </div>

            {cancelOpen ? (
              <Modal title="Cancelar agendamento" onClose={() => setCancelOpen(false)}>
                <form onSubmit={cancelAppointment} className="space-y-4">
                  <p className="text-sm text-muted">
                    Tudo bem mudar de planos. Se quiser, conte o motivo — ajuda o estabelecimento.
                  </p>
                  <Field label="Motivo (opcional)" id="cancel-reason">
                    <Textarea
                      id="cancel-reason"
                      value={cancelReason}
                      onChange={(e) => setCancelReason(e.target.value)}
                      maxLength={255}
                    />
                  </Field>
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" variant="danger" disabled={busy !== null} loading={busy === 'cancel'}>
                      Confirmar cancelamento
                    </Button>
                    <Button type="button" variant="ghost" onClick={() => setCancelOpen(false)}>
                      Manter agendamento
                    </Button>
                  </div>
                </form>
              </Modal>
            ) : null}

            {rescheduleOpen ? (
              <Modal title="Escolher novo horário" onClose={() => setRescheduleOpen(false)}>
                <div className="space-y-4">
                  <p className="text-sm text-muted">Selecione um dia e um horário livre.</p>
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
                    <SlotsSkeleton />
                  ) : slots.length === 0 ? (
                    <EmptyState title="Nenhum horário nesse dia">
                      Tente outra data — a agenda pode estar cheia.
                    </EmptyState>
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
                      loading={busy === 'reschedule'}
                      onClick={() => void reschedule()}
                    >
                      Confirmar novo horário
                    </Button>
                    <Button type="button" variant="ghost" onClick={() => setRescheduleOpen(false)}>
                      Voltar
                    </Button>
                  </div>
                </div>
              </Modal>
            ) : null}
          </section>
        ) : null}

        {data.review ? (
          <section aria-label="Sua avaliação" className="surface-elevated rounded-2xl p-5 sm:p-6">
            <h2 className="font-display text-lg font-semibold text-ink">Sua avaliação</h2>
            <div className="mt-3">
              <Stars value={data.review.rating} size="lg" />
              {data.review.comment ? (
                <p className="mt-2 text-sm leading-relaxed text-ink-muted">{data.review.comment}</p>
              ) : null}
            </div>
          </section>
        ) : data.canReview ? (
          <section aria-label="Avaliar atendimento" className="surface-elevated rounded-2xl p-5 sm:p-6">
            <h2 className="font-display text-lg font-semibold text-ink">
              Como foi seu atendimento?
            </h2>
            <p className="mt-1 text-sm text-muted">Sua opinião ajuda {data.tenant.name} a melhorar.</p>
            <form onSubmit={submitReview} className="mt-5 space-y-4">
              <StarPicker value={rating} onChange={setRating} />
              <Field label="Comentário (opcional)" id="review-comment">
                <Textarea
                  id="review-comment"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  maxLength={500}
                  placeholder="O que mais gostou?"
                />
              </Field>
              <Button type="submit" disabled={busy !== null || rating < 1} loading={busy === 'review'}>
                Enviar avaliação
              </Button>
            </form>
          </section>
        ) : null}
      </main>
    </div>
  );
}
