'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { BrandLogo } from '@/components/BrandLogo';
import { CopyButton, PixBlock } from '@/components/pix';
import { Alert, Button, EmptyState, Field, Input, Spinner, Stars, Textarea } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { formatBRL, formatDate, formatTime, todayYmd, whatsappLink } from '@/lib/format';
import type {
  BookAppointmentPayload,
  BookAppointmentResponse,
  PublicProfessional,
  PublicSlotsResponse,
  PublicTenantProfile,
  Service,
  WaitlistJoinResponse,
} from '@/lib/types';

type StepId = 'service' | 'professional' | 'date' | 'time' | 'details' | 'done';

const STEP_LABELS: Record<StepId, string> = {
  service: 'Serviço',
  professional: 'Profissional',
  date: 'Dia',
  time: 'Horário',
  details: 'Seus dados',
  done: 'Confirmação',
};

/** 'any' = sem preferência (a API usa o dono da agenda). */
type ProfessionalChoice = PublicProfessional | 'any' | null;

export default function PublicBookingPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  const [profile, setProfile] = useState<PublicTenantProfile | null>(null);
  const [step, setStep] = useState<StepId>('service');
  const [service, setService] = useState<Service | null>(null);
  const [professional, setProfessional] = useState<ProfessionalChoice>(null);
  const [date, setDate] = useState(todayYmd());
  const [slots, setSlots] = useState<string[]>([]);
  const [slot, setSlot] = useState<string | null>(null);
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bookResult, setBookResult] = useState<BookAppointmentResponse | null>(null);

  // Lista de espera do dia sem horários
  const [wlName, setWlName] = useState('');
  const [wlPhone, setWlPhone] = useState('');
  const [wlEmail, setWlEmail] = useState('');
  const [wlBusy, setWlBusy] = useState(false);
  const [wlResult, setWlResult] = useState<'added' | 'already' | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await api<PublicTenantProfile>(`/api/public/${slug}`, { auth: false });
        if (!cancelled) {
          const active = (data.services || []).filter((s) => s.isActive !== false);
          // Se a API não filtrar inativos, mantemos apenas ativos na UI pública
          setProfile({ ...data, services: active.length ? active : data.services || [] });
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Negócio não encontrado.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const professionals = useMemo(() => profile?.professionals ?? [], [profile]);
  const hasProfessionalStep = professionals.length > 1;

  const stepOrder = useMemo<StepId[]>(
    () =>
      hasProfessionalStep
        ? ['service', 'professional', 'date', 'time', 'details', 'done']
        : ['service', 'date', 'time', 'details', 'done'],
    [hasProfessionalStep],
  );

  const selectedProfessionalId =
    professional && professional !== 'any' ? professional.id : undefined;

  useEffect(() => {
    if (step !== 'time' || !service || !date) return;
    let cancelled = false;
    setSlotsLoading(true);
    setError(null);
    setWlResult(null);
    const qs = new URLSearchParams({ serviceId: service.id, date });
    if (selectedProfessionalId) qs.set('professionalId', selectedProfessionalId);
    void api<string[] | PublicSlotsResponse>(`/api/public/${slug}/slots?${qs.toString()}`, {
      auth: false,
    })
      .then((data) => {
        if (cancelled) return;
        const list = Array.isArray(data) ? data : data.slots || [];
        setSlots(list);
      })
      .catch((err) => {
        if (!cancelled) {
          setSlots([]);
          setError(err instanceof ApiError ? err.message : 'Não foi possível carregar horários.');
        }
      })
      .finally(() => {
        if (!cancelled) setSlotsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [step, service, date, slug, selectedProfessionalId]);

  const timezone = profile?.timezone;

  const stepStatus = useMemo(() => {
    const currentIndex = stepOrder.indexOf(step);
    return stepOrder.map((id, i) => ({
      id,
      label: STEP_LABELS[id],
      n: i + 1,
      current: i === currentIndex,
      complete: i < currentIndex,
    }));
  }, [step, stepOrder]);

  function goToStepAfterService() {
    setSlot(null);
    setStep(hasProfessionalStep ? 'professional' : 'date');
  }

  async function submitBooking(e: FormEvent) {
    e.preventDefault();
    if (!service || !slot) return;
    setSubmitting(true);
    setError(null);
    try {
      const payload: BookAppointmentPayload = {
        serviceId: service.id,
        professionalId: selectedProfessionalId,
        startsAt: slot,
        clientName: clientName.trim(),
        clientPhone: clientPhone.trim(),
        clientEmail: clientEmail.trim() || undefined,
        notes: notes.trim() || undefined,
      };
      const result = await api<BookAppointmentResponse>(`/api/public/${slug}/book`, {
        method: 'POST',
        auth: false,
        body: payload,
      });
      setBookResult(result);
      setStep('done');
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // Corrida por horário: volta para os slots e recarrega
        setError('Esse horário acabou de ser reservado, escolha outro.');
        setSlot(null);
        setStep('time');
      } else {
        setError(
          err instanceof ApiError ? err.message : 'Não foi possível concluir o agendamento.',
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function joinWaitlist(e: FormEvent) {
    e.preventDefault();
    setWlBusy(true);
    setError(null);
    try {
      const res = await api<WaitlistJoinResponse>(`/api/public/${slug}/waitlist`, {
        method: 'POST',
        auth: false,
        body: {
          dateKey: date,
          serviceId: service?.id,
          clientName: wlName.trim(),
          clientPhone: wlPhone.trim(),
          clientEmail: wlEmail.trim() || undefined,
        },
      });
      setWlResult(res.alreadyOnList ? 'already' : 'added');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível entrar na lista.');
    } finally {
      setWlBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-atmosphere p-6">
        <Spinner label="Carregando página…" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex min-h-screen flex-col bg-atmosphere">
        <div className="px-6 py-6">
          <BrandLogo />
        </div>
        <main className="mx-auto max-w-lg px-6 py-16">
          <Alert>{error || 'Página não encontrada.'}</Alert>
        </main>
      </div>
    );
  }

  const professionalLabel =
    professional === 'any' ? 'Sem preferência' : professional ? professional.name : null;

  return (
    <div className="flex min-h-screen flex-col bg-atmosphere">
      <header className="border-b border-stone-200/70 bg-white/50 px-6 py-5 backdrop-blur">
        <div className="mx-auto max-w-2xl">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-display text-2xl font-semibold text-stone-900">{profile.name}</p>
              <p className="text-sm text-stone-500">Agendamento online</p>
            </div>
            <BrandLogo href="/" size="sm" className="!text-base opacity-70" />
          </div>
          {profile.rating.count > 0 && profile.rating.average != null ? (
            <p className="mt-3 flex items-center gap-2 text-sm text-stone-700">
              <Stars value={profile.rating.average} />
              <span>
                <strong>{profile.rating.average.toLocaleString('pt-BR')}</strong> (
                {profile.rating.count} {profile.rating.count === 1 ? 'avaliação' : 'avaliações'})
              </span>
            </p>
          ) : null}
          {profile.about ? (
            <p className="mt-3 max-w-xl text-sm text-stone-600">{profile.about}</p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-stone-600">
            {profile.address ? <span>{profile.address}</span> : null}
            {profile.whatsapp ? (
              <a
                href={whatsappLink(profile.whatsapp)}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-emerald-800 hover:underline"
              >
                WhatsApp
              </a>
            ) : null}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-8">
        <nav aria-label="Etapas do agendamento" className="mb-8">
          <ol className="flex flex-wrap gap-2">
            {stepStatus.map((s) => (
              <li key={s.id}>
                <span
                  className={`inline-flex items-center gap-2 rounded-md px-2.5 py-1 text-xs font-semibold ${
                    s.current
                      ? 'bg-emerald-700 text-white'
                      : s.complete
                        ? 'bg-emerald-100 text-emerald-900'
                        : 'bg-stone-200/80 text-stone-600'
                  }`}
                  aria-current={s.current ? 'step' : undefined}
                >
                  <span aria-hidden>{s.n}.</span> {s.label}
                </span>
              </li>
            ))}
          </ol>
        </nav>

        {error && step !== 'done' ? (
          <div className="mb-4">
            <Alert>{error}</Alert>
          </div>
        ) : null}

        {step === 'service' ? (
          <section aria-labelledby="step-service">
            <h1 id="step-service" className="font-display text-2xl font-semibold text-stone-900">
              Escolha o serviço
            </h1>
            <ul className="mt-6 space-y-3">
              {(profile.services || []).length === 0 ? (
                <EmptyState>Nenhum serviço disponível no momento.</EmptyState>
              ) : (
                profile.services.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      className="w-full rounded-lg bg-white p-4 text-left ring-1 ring-stone-200 transition hover:ring-emerald-600 focus-visible:ring-2 focus-visible:ring-emerald-700"
                      onClick={() => {
                        setService(s);
                        goToStepAfterService();
                      }}
                    >
                      <p className="font-semibold text-stone-900">{s.name}</p>
                      <p className="mt-1 text-sm text-stone-600">
                        {s.durationMinutes} min · {formatBRL(s.priceCents)}
                        {s.depositCents ? ` · sinal de ${formatBRL(s.depositCents)}` : ''}
                      </p>
                      {s.description ? (
                        <p className="mt-2 text-sm text-stone-500">{s.description}</p>
                      ) : null}
                    </button>
                  </li>
                ))
              )}
            </ul>
          </section>
        ) : null}

        {step === 'professional' && service ? (
          <section aria-labelledby="step-professional">
            <h1
              id="step-professional"
              className="font-display text-2xl font-semibold text-stone-900"
            >
              Escolha o profissional
            </h1>
            <p className="mt-2 text-sm text-stone-600">
              Serviço: <strong>{service.name}</strong>
            </p>
            <ul className="mt-6 space-y-3">
              <li>
                <button
                  type="button"
                  className="w-full rounded-lg bg-white p-4 text-left ring-1 ring-stone-200 transition hover:ring-emerald-600 focus-visible:ring-2 focus-visible:ring-emerald-700"
                  onClick={() => {
                    setProfessional('any');
                    setSlot(null);
                    setStep('date');
                  }}
                >
                  <p className="font-semibold text-stone-900">Sem preferência</p>
                  <p className="mt-1 text-sm text-stone-600">Qualquer profissional disponível</p>
                </button>
              </li>
              {professionals.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className="w-full rounded-lg bg-white p-4 text-left ring-1 ring-stone-200 transition hover:ring-emerald-600 focus-visible:ring-2 focus-visible:ring-emerald-700"
                    onClick={() => {
                      setProfessional(p);
                      setSlot(null);
                      setStep('date');
                    }}
                  >
                    <p className="font-semibold text-stone-900">{p.name}</p>
                    {p.role === 'OWNER' ? (
                      <p className="mt-1 text-sm text-stone-600">Responsável</p>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-6">
              <Button type="button" variant="secondary" onClick={() => setStep('service')}>
                Voltar
              </Button>
            </div>
          </section>
        ) : null}

        {step === 'date' && service ? (
          <section aria-labelledby="step-day">
            <h1 id="step-day" className="font-display text-2xl font-semibold text-stone-900">
              Escolha o dia
            </h1>
            <p className="mt-2 text-sm text-stone-600">
              Serviço: <strong>{service.name}</strong>
              {professionalLabel ? (
                <>
                  {' '}
                  · Profissional: <strong>{professionalLabel}</strong>
                </>
              ) : null}
            </p>
            <div className="mt-6 max-w-xs">
              <Field label="Data" id="booking-date">
                <Input
                  id="booking-date"
                  type="date"
                  min={todayYmd()}
                  value={date}
                  onChange={(e) => {
                    setDate(e.target.value);
                    setSlot(null);
                    setWlResult(null);
                  }}
                />
              </Field>
            </div>
            <div className="mt-6 flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setStep(hasProfessionalStep ? 'professional' : 'service')}
              >
                Voltar
              </Button>
              <Button
                type="button"
                onClick={() => {
                  setSlot(null);
                  setStep('time');
                }}
                disabled={!date}
              >
                Ver horários
              </Button>
            </div>
          </section>
        ) : null}

        {step === 'time' && service ? (
          <section aria-labelledby="step-slot">
            <h1 id="step-slot" className="font-display text-2xl font-semibold text-stone-900">
              Escolha o horário
            </h1>
            <p className="mt-2 text-sm text-stone-600">{formatDate(date, timezone)}</p>
            {slotsLoading ? (
              <div className="mt-6">
                <Spinner label="Buscando horários…" />
              </div>
            ) : slots.length === 0 ? (
              <div className="mt-6 space-y-5">
                <EmptyState>Nenhum horário livre neste dia.</EmptyState>
                <section
                  aria-labelledby="waitlist-title"
                  className="rounded-lg bg-white p-5 ring-1 ring-stone-200"
                >
                  <h2
                    id="waitlist-title"
                    className="font-display text-lg font-semibold text-stone-900"
                  >
                    Avise-me se abrir vaga
                  </h2>
                  {wlResult ? (
                    <div className="mt-3">
                      <Alert tone="success">
                        {wlResult === 'already'
                          ? 'Você já está na lista de espera deste dia. Vamos te avisar se abrir vaga.'
                          : 'Pronto! Você entrou na lista de espera e será avisado se abrir vaga.'}
                      </Alert>
                    </div>
                  ) : (
                    <form onSubmit={joinWaitlist} className="mt-4 space-y-4" noValidate>
                      <p className="text-sm text-stone-600">
                        Deixe seu contato e avisaremos caso algum horário abra em{' '}
                        <strong>{formatDate(date, timezone)}</strong>.
                      </p>
                      <Field label="Nome" id="wl-name">
                        <Input
                          id="wl-name"
                          required
                          autoComplete="name"
                          value={wlName}
                          onChange={(e) => setWlName(e.target.value)}
                        />
                      </Field>
                      <Field label="WhatsApp" id="wl-phone" hint="Com DDD, ex: 11999998888">
                        <Input
                          id="wl-phone"
                          required
                          type="tel"
                          autoComplete="tel"
                          value={wlPhone}
                          onChange={(e) => setWlPhone(e.target.value)}
                        />
                      </Field>
                      <Field label="E-mail (opcional)" id="wl-email">
                        <Input
                          id="wl-email"
                          type="email"
                          autoComplete="email"
                          value={wlEmail}
                          onChange={(e) => setWlEmail(e.target.value)}
                        />
                      </Field>
                      <Button type="submit" disabled={wlBusy || !wlName.trim() || !wlPhone.trim()}>
                        {wlBusy ? 'Enviando…' : 'Entrar na lista de espera'}
                      </Button>
                    </form>
                  )}
                </section>
              </div>
            ) : (
              <ul
                className="mt-6 grid grid-cols-3 gap-2 sm:grid-cols-4"
                role="listbox"
                aria-label="Horários disponíveis"
              >
                {slots.map((iso) => {
                  const selected = slot === iso;
                  return (
                    <li key={iso}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={selected}
                        className={`w-full rounded-md px-2 py-2.5 text-sm font-semibold ring-1 transition ${
                          selected
                            ? 'bg-emerald-700 text-white ring-emerald-700'
                            : 'bg-white text-stone-800 ring-stone-300 hover:ring-emerald-600'
                        }`}
                        onClick={() => setSlot(iso)}
                      >
                        {formatTime(iso, timezone)}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="mt-6 flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={() => setStep('date')}>
                Voltar
              </Button>
              <Button type="button" disabled={!slot} onClick={() => setStep('details')}>
                Continuar
              </Button>
            </div>
          </section>
        ) : null}

        {step === 'details' && service && slot ? (
          <section aria-labelledby="step-form">
            <h1 id="step-form" className="font-display text-2xl font-semibold text-stone-900">
              Seus dados
            </h1>
            <p className="mt-2 text-sm text-stone-600">
              {service.name}
              {professionalLabel ? ` · ${professionalLabel}` : ''} · {formatDate(date, timezone)} ·{' '}
              {formatTime(slot, timezone)}
            </p>
            <form onSubmit={submitBooking} className="mt-6 space-y-4" noValidate>
              <Field label="Nome completo" id="clientName">
                <Input
                  id="clientName"
                  required
                  autoComplete="name"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                />
              </Field>
              <Field label="WhatsApp / telefone" id="clientPhone" hint="Com DDD, ex: 11999998888">
                <Input
                  id="clientPhone"
                  required
                  type="tel"
                  autoComplete="tel"
                  value={clientPhone}
                  onChange={(e) => setClientPhone(e.target.value)}
                />
              </Field>
              <Field label="E-mail (opcional)" id="clientEmail">
                <Input
                  id="clientEmail"
                  type="email"
                  autoComplete="email"
                  value={clientEmail}
                  onChange={(e) => setClientEmail(e.target.value)}
                />
              </Field>
              <Field label="Observações (opcional)" id="notes">
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  maxLength={500}
                />
              </Field>
              <div className="flex flex-wrap gap-2 pt-2">
                <Button type="button" variant="secondary" onClick={() => setStep('time')}>
                  Voltar
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? 'Confirmando…' : 'Confirmar agendamento'}
                </Button>
              </div>
            </form>
          </section>
        ) : null}

        {step === 'done' && bookResult ? (
          <section aria-labelledby="step-done" aria-live="polite" className="space-y-5">
            <h1 id="step-done" className="font-display text-2xl font-semibold text-stone-900">
              {bookResult.pix ? 'Quase lá: pague o sinal' : 'Agendamento confirmado'}
            </h1>

            {bookResult.pix ? (
              <Alert tone="info">
                Recebemos seu pedido.{' '}
                <strong>O horário só é confirmado após o pagamento do sinal</strong> via PIX abaixo.
              </Alert>
            ) : (
              <Alert tone="success">
                Pronto! {profile.name} recebeu seu agendamento. Guarde o link abaixo para gerenciar
                seu horário.
              </Alert>
            )}

            <dl className="space-y-3 rounded-lg bg-white p-5 text-sm ring-1 ring-stone-200">
              <div>
                <dt className="text-stone-500">Serviço</dt>
                <dd className="font-medium text-stone-900">{service?.name}</dd>
              </div>
              {professionalLabel ? (
                <div>
                  <dt className="text-stone-500">Profissional</dt>
                  <dd className="font-medium text-stone-900">{professionalLabel}</dd>
                </div>
              ) : null}
              <div>
                <dt className="text-stone-500">Quando</dt>
                <dd className="font-medium text-stone-900">
                  {slot ? `${formatDate(date, timezone)} às ${formatTime(slot, timezone)}` : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-stone-500">Cliente</dt>
                <dd className="font-medium text-stone-900">{clientName}</dd>
              </div>
            </dl>

            {bookResult.pix ? (
              <PixBlock
                amountCents={bookResult.pix.amountCents}
                copyPaste={bookResult.pix.copyPaste}
                qrCodeBase64={bookResult.pix.qrCodeBase64}
                expiresAt={bookResult.pix.expiresAt}
                timezone={timezone}
                note="O horário só é confirmado após o pagamento do sinal."
              />
            ) : null}

            {bookResult.depositMode === 'local' && bookResult.depositCents > 0 ? (
              <Alert tone="info">
                Sinal de {formatBRL(bookResult.depositCents)} a combinar no local.
              </Alert>
            ) : null}

            <div className="rounded-lg bg-white p-5 ring-1 ring-stone-200">
              <h2 className="font-display text-lg font-semibold text-stone-900">
                Gerencie seu agendamento
              </h2>
              <p className="mt-1 text-sm text-stone-600">
                Use este link para confirmar presença, remarcar ou cancelar.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <a
                  href={bookResult.manageUrl}
                  className="break-all text-sm font-semibold text-emerald-800 hover:underline"
                >
                  Gerenciar meu agendamento
                </a>
                <CopyButton value={bookResult.manageUrl} label="Copiar link" />
              </div>
            </div>
          </section>
        ) : null}

        {(profile.reviews || []).length > 0 ? (
          <section aria-labelledby="reviews-title" className="mt-14">
            <h2 id="reviews-title" className="font-display text-xl font-semibold text-stone-900">
              Avaliações recentes
            </h2>
            <ul className="mt-4 space-y-3">
              {profile.reviews.map((r, i) => (
                <li key={i} className="rounded-lg bg-white p-4 ring-1 ring-stone-200">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-stone-900">{r.clientName || 'Cliente'}</p>
                    <Stars value={r.rating} />
                  </div>
                  {r.comment ? <p className="mt-2 text-sm text-stone-700">{r.comment}</p> : null}
                  <p className="mt-2 text-xs text-stone-500">{formatDate(r.createdAt, timezone)}</p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </main>
    </div>
  );
}
