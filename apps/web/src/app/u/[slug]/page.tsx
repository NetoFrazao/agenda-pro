'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { BrandLogo } from '@/components/BrandLogo';
import { CopyButton, PixBlock } from '@/components/pix';
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  Field,
  Input,
  Spinner,
  Stars,
  Textarea,
} from '@/components/ui';
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

function StepPills({
  steps,
}: {
  steps: { id: StepId; label: string; n: number; current: boolean; complete: boolean }[];
}) {
  return (
    <nav aria-label="Etapas do agendamento" className="sticky top-0 z-20 -mx-6 mb-8 px-6 py-4">
      <div className="glass-panel rounded-2xl px-4 py-3 shadow-[0_8px_32px_-16px_rgba(14,17,16,0.2)]">
        <ol className="flex flex-wrap gap-1.5">
          {steps.map((s) => (
            <li key={s.id}>
              <span
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold tracking-tight transition ${
                  s.current
                    ? 'bg-ink text-white shadow-[0_6px_16px_-8px_rgba(14,17,16,0.6)]'
                    : s.complete
                      ? 'bg-teal-100 text-teal-950'
                      : 'bg-paper-2/80 text-muted'
                }`}
                aria-current={s.current ? 'step' : undefined}
              >
                <span
                  className={`flex size-4 items-center justify-center rounded-md text-[10px] font-bold ${
                    s.current
                      ? 'bg-mint text-ink'
                      : s.complete
                        ? 'bg-mint-deep text-white'
                        : 'bg-line text-muted'
                  }`}
                  aria-hidden
                >
                  {s.complete && !s.current ? '✓' : s.n}
                </span>
                <span className="hidden sm:inline">{s.label}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>
    </nav>
  );
}

function ServiceCard({ service, onSelect }: { service: Service; onSelect: () => void }) {
  return (
    <button
      type="button"
      className="surface-elevated group w-full rounded-2xl p-5 text-left transition hover:shadow-[0_24px_48px_-24px_rgba(14,17,16,0.4)] focus-visible:ring-2 focus-visible:ring-teal-700"
      onClick={onSelect}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="font-display text-lg font-semibold text-ink">{service.name}</p>
          {service.description ? (
            <p className="mt-1.5 text-sm leading-relaxed text-[#6b736e]">{service.description}</p>
          ) : null}
          {service.depositCents ? (
            <p className="mt-2 text-xs font-medium text-teal-800">
              Sinal de {formatBRL(service.depositCents)}
            </p>
          ) : null}
        </div>
        <div className="shrink-0 text-right">
          <p className="font-display text-xl font-semibold text-teal-800">
            {formatBRL(service.priceCents)}
          </p>
          <Badge tone="stone">{service.durationMinutes} min</Badge>
        </div>
      </div>
    </button>
  );
}

function ChoiceCard({
  title,
  subtitle,
  onSelect,
}: {
  title: string;
  subtitle?: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className="surface-elevated w-full rounded-2xl p-5 text-left transition hover:shadow-[0_24px_48px_-24px_rgba(14,17,16,0.35)] focus-visible:ring-2 focus-visible:ring-teal-700"
      onClick={onSelect}
    >
      <p className="font-display text-lg font-semibold text-ink">{title}</p>
      {subtitle ? <p className="mt-1 text-sm text-[#6b736e]">{subtitle}</p> : null}
    </button>
  );
}

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
      <header className="glass-panel border-b border-[#d5dbd6]/60 px-6 py-6">
        <div className="mx-auto max-w-2xl">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
                {profile.name}
              </p>
              <p className="mt-1 text-sm text-[#6b736e]">Agendamento online</p>
            </div>
            <BrandLogo href="/" size="sm" className="shrink-0 opacity-60" />
          </div>

          {profile.rating.count > 0 && profile.rating.average != null ? (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Stars value={profile.rating.average} />
              <span className="text-sm text-[#3f4742]">
                <strong className="font-semibold text-ink">
                  {profile.rating.average.toLocaleString('pt-BR')}
                </strong>{' '}
                · {profile.rating.count} {profile.rating.count === 1 ? 'avaliação' : 'avaliações'}
              </span>
            </div>
          ) : null}

          {profile.about ? (
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-[#6b736e]">{profile.about}</p>
          ) : null}

          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-[#6b736e]">
            {profile.address ? (
              <span className="flex items-center gap-1.5">
                <span aria-hidden className="text-teal-800">
                  ●
                </span>
                {profile.address}
              </span>
            ) : null}
            {profile.whatsapp ? (
              <a
                href={whatsappLink(profile.whatsapp)}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-teal-800 transition hover:text-teal-900 hover:underline"
              >
                WhatsApp
              </a>
            ) : null}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-8">
        {step !== 'done' ? <StepPills steps={stepStatus} /> : null}

        {error && step !== 'done' ? (
          <div className="mb-4">
            <Alert>{error}</Alert>
          </div>
        ) : null}

        {step === 'service' ? (
          <section aria-labelledby="step-service" className="animate-fade-up">
            <h1 id="step-service" className="font-display text-2xl font-semibold text-ink">
              Escolha o serviço
            </h1>
            <p className="mt-2 text-sm text-[#6b736e]">Selecione o que deseja agendar.</p>
            <ul className="mt-6 space-y-3">
              {(profile.services || []).length === 0 ? (
                <EmptyState>Nenhum serviço disponível no momento.</EmptyState>
              ) : (
                profile.services.map((s) => (
                  <li key={s.id}>
                    <ServiceCard
                      service={s}
                      onSelect={() => {
                        setService(s);
                        goToStepAfterService();
                      }}
                    />
                  </li>
                ))
              )}
            </ul>
          </section>
        ) : null}

        {step === 'professional' && service ? (
          <section aria-labelledby="step-professional" className="animate-fade-up">
            <h1 id="step-professional" className="font-display text-2xl font-semibold text-ink">
              Escolha o profissional
            </h1>
            <p className="mt-2 text-sm text-[#6b736e]">
              Serviço: <strong className="text-ink">{service.name}</strong>
            </p>
            <ul className="mt-6 space-y-3">
              <li>
                <ChoiceCard
                  title="Sem preferência"
                  subtitle="Qualquer profissional disponível"
                  onSelect={() => {
                    setProfessional('any');
                    setSlot(null);
                    setStep('date');
                  }}
                />
              </li>
              {professionals.map((p) => (
                <li key={p.id}>
                  <ChoiceCard
                    title={p.name}
                    subtitle={p.role === 'OWNER' ? 'Responsável' : undefined}
                    onSelect={() => {
                      setProfessional(p);
                      setSlot(null);
                      setStep('date');
                    }}
                  />
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
          <section aria-labelledby="step-day" className="animate-fade-up">
            <h1 id="step-day" className="font-display text-2xl font-semibold text-ink">
              Escolha o dia
            </h1>
            <p className="mt-2 text-sm text-[#6b736e]">
              Serviço: <strong className="text-ink">{service.name}</strong>
              {professionalLabel ? (
                <>
                  {' '}
                  · Profissional: <strong className="text-ink">{professionalLabel}</strong>
                </>
              ) : null}
            </p>
            <div className="surface-elevated mt-6 max-w-xs rounded-2xl p-5">
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
          <section aria-labelledby="step-slot" className="animate-fade-up">
            <h1 id="step-slot" className="font-display text-2xl font-semibold text-ink">
              Escolha o horário
            </h1>
            <p className="mt-2 text-sm text-[#6b736e]">{formatDate(date, timezone)}</p>
            {slotsLoading ? (
              <div className="mt-6">
                <Spinner label="Buscando horários…" />
              </div>
            ) : slots.length === 0 ? (
              <div className="mt-6 space-y-5">
                <EmptyState>
                  <p className="font-medium text-ink">Nenhum horário livre neste dia.</p>
                  <p className="mt-1">Entre na lista de espera e avisaremos se abrir vaga.</p>
                </EmptyState>
                <section
                  aria-labelledby="waitlist-title"
                  className="surface-elevated rounded-2xl p-6"
                >
                  <h2 id="waitlist-title" className="font-display text-lg font-semibold text-ink">
                    Avise-me se abrir vaga
                  </h2>
                  {wlResult ? (
                    <div className="mt-4">
                      <Alert tone="success">
                        {wlResult === 'already'
                          ? 'Você já está na lista de espera deste dia. Vamos te avisar se abrir vaga.'
                          : 'Pronto! Você entrou na lista de espera e será avisado se abrir vaga.'}
                      </Alert>
                    </div>
                  ) : (
                    <form onSubmit={joinWaitlist} className="mt-5 space-y-4" noValidate>
                      <p className="text-sm text-[#6b736e]">
                        Deixe seu contato e avisaremos caso algum horário abra em{' '}
                        <strong className="text-ink">{formatDate(date, timezone)}</strong>.
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
                        data-selected={selected}
                        className="slot-chip w-full rounded-xl bg-white px-2 py-2.5 text-sm font-semibold text-ink ring-1 ring-[#d5dbd6] hover:ring-teal-700/40"
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
          <section aria-labelledby="step-form" className="animate-fade-up">
            <h1 id="step-form" className="font-display text-2xl font-semibold text-ink">
              Seus dados
            </h1>
            <p className="mt-2 text-sm text-[#6b736e]">
              {service.name}
              {professionalLabel ? ` · ${professionalLabel}` : ''} · {formatDate(date, timezone)} ·{' '}
              {formatTime(slot, timezone)}
            </p>
            <form
              onSubmit={submitBooking}
              className="surface-elevated mt-6 space-y-4 rounded-2xl p-6"
              noValidate
            >
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
          <section
            aria-labelledby="step-done"
            aria-live="polite"
            className="animate-fade-up space-y-5"
          >
            <div className="text-center sm:text-left">
              <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-teal-100 text-2xl text-teal-800">
                ✓
              </span>
              <h1
                id="step-done"
                className="mt-4 font-display text-2xl font-semibold text-ink sm:text-3xl"
              >
                {bookResult.pix ? 'Quase lá: pague o sinal' : 'Agendamento confirmado'}
              </h1>
            </div>

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

            <dl className="surface-elevated space-y-4 rounded-2xl p-6 text-sm">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-[#6b736e]">
                  Serviço
                </dt>
                <dd className="mt-1 font-medium text-ink">{service?.name}</dd>
              </div>
              {professionalLabel ? (
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-[#6b736e]">
                    Profissional
                  </dt>
                  <dd className="mt-1 font-medium text-ink">{professionalLabel}</dd>
                </div>
              ) : null}
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-[#6b736e]">
                  Quando
                </dt>
                <dd className="mt-1 font-medium text-ink">
                  {slot ? `${formatDate(date, timezone)} às ${formatTime(slot, timezone)}` : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-[#6b736e]">
                  Cliente
                </dt>
                <dd className="mt-1 font-medium text-ink">{clientName}</dd>
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

            <div className="surface-elevated rounded-2xl p-6">
              <h2 className="font-display text-lg font-semibold text-ink">
                Gerencie seu agendamento
              </h2>
              <p className="mt-1 text-sm text-[#6b736e]">
                Use este link para confirmar presença, remarcar ou cancelar.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <a
                  href={bookResult.manageUrl}
                  className="break-all text-sm font-semibold text-teal-800 hover:underline"
                >
                  Gerenciar meu agendamento
                </a>
                <CopyButton value={bookResult.manageUrl} label="Copiar link" />
              </div>
            </div>
          </section>
        ) : null}

        {(profile.reviews || []).length > 0 ? (
          <section
            aria-labelledby="reviews-title"
            className="mt-14 border-t border-[#d5dbd6]/80 pt-10"
          >
            <h2 id="reviews-title" className="font-display text-xl font-semibold text-ink">
              Avaliações recentes
            </h2>
            <ul className="mt-5 space-y-3">
              {profile.reviews.map((r, i) => (
                <li key={i} className="surface-elevated rounded-2xl p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-ink">{r.clientName || 'Cliente'}</p>
                    <Stars value={r.rating} />
                  </div>
                  {r.comment ? (
                    <p className="mt-2 text-sm leading-relaxed text-[#3f4742]">{r.comment}</p>
                  ) : null}
                  <p className="mt-2 text-xs text-[#6b736e]">{formatDate(r.createdAt, timezone)}</p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </main>
    </div>
  );
}
