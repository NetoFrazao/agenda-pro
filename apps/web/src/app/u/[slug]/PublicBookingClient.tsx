'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  BrandLogo,
  Button,
  CopyButton,
  EmptyState,
  Field,
  Input,
  PixBlock,
  Skeleton,
  SlotListbox,
  Stars,
  Textarea,
  useToast,
} from '@/components';
import { Calendar, CheckCircle2, Clock, MapPin, MessageCircle, User } from '@/components/icons';
import { api, ApiError } from '@/lib/api';
import {
  addDaysYmd,
  formatBRL,
  formatDate,
  formatTime,
  todayYmd,
  todayYmdInTimeZone,
  whatsappLink,
} from '@/lib/format';
import type {
  BookAppointmentPayload,
  BookAppointmentResponse,
  PublicProfessional,
  PublicSlotsResponse,
  PublicTenantProfile,
  Service,
  WaitlistJoinResponse,
} from '@/lib/types';

type StepId = 'service' | 'professional' | 'when' | 'details' | 'done';

const STEP_LABELS: Record<StepId, string> = {
  service: 'Serviço',
  professional: 'Profissional',
  when: 'Quando',
  details: 'Seus dados',
  done: 'Pronto',
};

/** 'any' = sem preferência (a API usa o dono da agenda). */
type ProfessionalChoice = PublicProfessional | 'any' | null;

type DateChip = { ymd: string; weekday: string; dayNum: number; hint: string };

function buildDateChips(startYmd: string, count = 14): DateChip[] {
  return Array.from({ length: count }, (_, i) => {
    const ymd = addDaysYmd(startYmd, i);
    const d = new Date(`${ymd}T12:00:00`);
    const weekday = d
      .toLocaleDateString('pt-BR', { weekday: 'short' })
      .replace('.', '')
      .replace(/^./, (c) => c.toUpperCase());
    const hint = i === 0 ? 'Hoje' : i === 1 ? 'Amanhã' : weekday;
    return { ymd, weekday, dayNum: d.getDate(), hint };
  });
}

async function fetchSlots(
  slug: string,
  serviceId: string,
  date: string,
  professionalId?: string,
): Promise<string[]> {
  const qs = new URLSearchParams({ serviceId, date });
  if (professionalId) qs.set('professionalId', professionalId);
  const data = await api<string[] | PublicSlotsResponse>(
    `/api/public/${slug}/slots?${qs.toString()}`,
    { auth: false },
  );
  return Array.isArray(data) ? data : data.slots || [];
}

function StepPills({
  steps,
  onJump,
}: {
  steps: { id: StepId; label: string; n: number; current: boolean; complete: boolean }[];
  onJump: (id: StepId) => void;
}) {
  return (
    <nav aria-label="Etapas do agendamento" className="sticky top-0 z-20 -mx-4 mb-6 px-4 py-3 sm:-mx-6 sm:px-6">
      <div className="surface-elevated rounded-2xl px-3 py-2.5 shadow-[var(--shadow-dropdown)] sm:px-4">
        <ol className="flex gap-1 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {steps.map((s) => (
            <li key={s.id} className="shrink-0">
              <button
                type="button"
                disabled={!s.complete}
                onClick={() => onJump(s.id)}
                className={`inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold tracking-tight transition focus-visible:ring-2 focus-visible:ring-mint-deep disabled:cursor-default ${
                  s.current
                    ? 'bg-ink text-white shadow-[var(--shadow-primary)]'
                    : s.complete
                      ? 'bg-success-bg text-mint-deep hover:bg-mint/20'
                      : 'bg-paper-2/80 text-muted'
                }`}
                aria-current={s.current ? 'step' : undefined}
              >
                <span
                  className={`flex size-5 items-center justify-center rounded-md text-[10px] font-bold ${
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
                <span>{s.label}</span>
              </button>
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
      className="surface-elevated group min-h-11 w-full rounded-2xl p-5 text-left transition hover:shadow-[var(--shadow-dropdown)] focus-visible:ring-2 focus-visible:ring-mint-deep"
      onClick={onSelect}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="font-display text-lg font-semibold text-ink">{service.name}</p>
          {service.description ? (
            <p className="mt-1.5 text-sm leading-relaxed text-muted">{service.description}</p>
          ) : null}
          {service.depositCents ? (
            <p className="mt-2 text-xs font-medium text-mint-deep">
              Sinal de {formatBRL(service.depositCents)}
            </p>
          ) : null}
        </div>
        <div className="shrink-0 text-right">
          <p className="font-display text-xl font-semibold text-mint-deep">
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
      className="surface-elevated min-h-11 w-full rounded-2xl p-5 text-left transition hover:shadow-[var(--shadow-dropdown)] focus-visible:ring-2 focus-visible:ring-mint-deep"
      onClick={onSelect}
    >
      <p className="font-display text-lg font-semibold text-ink">{title}</p>
      {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
    </button>
  );
}

function SlotsSkeleton() {
  return (
    <div
      className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-4"
      role="status"
      aria-label="Carregando horários"
    >
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} className="h-11 w-full rounded-xl" />
      ))}
      <span className="sr-only">Buscando horários…</span>
    </div>
  );
}

function PageLoadingSkeleton() {
  return (
    <div className="flex min-h-screen flex-col bg-atmosphere">
      <header className="border-b border-line/60 px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-2xl space-y-3">
          <Skeleton className="h-8 w-48 sm:w-64" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
      </header>
      <main className="mx-auto w-full max-w-2xl flex-1 space-y-4 px-4 py-8 sm:px-6">
        <Skeleton className="h-12 w-full rounded-2xl" />
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-56 max-w-full" />
        <div className="space-y-3 pt-2">
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-24 w-full rounded-2xl" />
        </div>
      </main>
    </div>
  );
}

export function PublicBookingClient({ slug }: { slug: string }) {
  const toast = useToast();
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
  const [nextOpenDate, setNextOpenDate] = useState<string | null>(null);
  const [nextOpenBusy, setNextOpenBusy] = useState(false);

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
          setProfile({ ...data, services: active.length ? active : data.services || [] });
          if (data.timezone) setDate(todayYmdInTimeZone(data.timezone));
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Não encontramos essa página.');
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
  const minDate = profile?.timezone ? todayYmdInTimeZone(profile.timezone) : todayYmd();

  const stepOrder = useMemo<StepId[]>(
    () =>
      hasProfessionalStep
        ? ['service', 'professional', 'when', 'details', 'done']
        : ['service', 'when', 'details', 'done'],
    [hasProfessionalStep],
  );

  const selectedProfessionalId =
    professional && professional !== 'any' ? professional.id : undefined;

  const dateChips = useMemo(() => buildDateChips(minDate, 14), [minDate]);

  useEffect(() => {
    if (step !== 'when' || !service || !date) return;
    let cancelled = false;
    setSlotsLoading(true);
    setError(null);
    setWlResult(null);
    setNextOpenDate(null);
    void fetchSlots(slug, service.id, date, selectedProfessionalId)
      .then(async (list) => {
        if (cancelled) return;
        setSlots(list);
        if (list.length === 0) {
          setNextOpenBusy(true);
          try {
            let found: string | null = null;
            for (let i = 1; i <= 14; i++) {
              if (cancelled) return;
              const candidate = addDaysYmd(date, i);
              const next = await fetchSlots(slug, service.id, candidate, selectedProfessionalId);
              if (next.length > 0) {
                found = candidate;
                break;
              }
            }
            if (!cancelled) setNextOpenDate(found);
          } finally {
            if (!cancelled) setNextOpenBusy(false);
          }
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setSlots([]);
          const msg =
            err instanceof ApiError ? err.message : 'Não conseguimos carregar os horários.';
          setError(msg);
          toast.error('Horários indisponíveis', msg);
        }
      })
      .finally(() => {
        if (!cancelled) setSlotsLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // toast estável o suficiente; omitido para não refetch em re-render
    // eslint-disable-next-line react-hooks/exhaustive-deps -- carregar slots só quando a escolha muda
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
    setStep(hasProfessionalStep ? 'professional' : 'when');
  }

  function jumpToCompletedStep(id: StepId) {
    const target = stepOrder.indexOf(id);
    const current = stepOrder.indexOf(step);
    if (target < 0 || target >= current) return;
    setStep(id);
  }

  function selectDate(ymd: string) {
    setDate(ymd);
    setSlot(null);
    setWlResult(null);
    setNextOpenDate(null);
  }

  function selectSlot(iso: string) {
    setSlot(iso);
    setStep('details');
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
      toast.success(
        result.pix ? 'Pedido recebido' : 'Horário reservado!',
        result.pix ? 'Pague o sinal para confirmar.' : 'Guarde o link para gerenciar seu horário.',
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const msg = 'Esse horário acabou de ser reservado. Escolha outro, por favor.';
        setError(msg);
        toast.error('Horário ocupado', msg);
        setSlot(null);
        setStep('when');
      } else {
        const msg =
          err instanceof ApiError ? err.message : 'Não foi possível concluir o agendamento.';
        setError(msg);
        toast.error('Algo deu errado', msg);
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
      toast.success(
        res.alreadyOnList ? 'Você já está na lista' : 'Entrou na lista de espera',
        'Avisamos se abrir uma vaga.',
      );
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Não foi possível entrar na lista.';
      setError(msg);
      toast.error('Lista de espera', msg);
    } finally {
      setWlBusy(false);
    }
  }

  if (loading) {
    return <PageLoadingSkeleton />;
  }

  if (!profile) {
    return (
      <div className="flex min-h-screen flex-col bg-atmosphere">
        <div className="px-4 py-6 sm:px-6">
          <BrandLogo />
        </div>
        <main className="mx-auto max-w-lg px-4 py-16 sm:px-6">
          <Alert>{error || 'Página não encontrada.'}</Alert>
        </main>
      </div>
    );
  }

  const professionalLabel =
    professional === 'any' ? 'Sem preferência' : professional ? professional.name : null;

  return (
    <div className="flex min-h-screen flex-col bg-atmosphere">
      <header className="border-b border-line/60 bg-gradient-to-b from-paper via-paper to-atmosphere px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-2xl">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
                {profile.name}
              </p>
              <p className="mt-1 text-sm text-muted">Escolha um horário em poucos toques</p>
            </div>
            <BrandLogo href="/" size="sm" className="shrink-0 opacity-60" />
          </div>

          {profile.rating.count > 0 && profile.rating.average != null ? (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Stars value={profile.rating.average} />
              <span className="text-sm text-ink-muted">
                <strong className="font-semibold text-ink">
                  {profile.rating.average.toLocaleString('pt-BR')}
                </strong>{' '}
                · {profile.rating.count}{' '}
                {profile.rating.count === 1 ? 'avaliação' : 'avaliações'}
              </span>
            </div>
          ) : null}

          {profile.about ? (
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">{profile.about}</p>
          ) : null}

          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted">
            {profile.address ? (
              <span className="inline-flex min-h-11 items-center gap-1.5">
                <MapPin className="size-4 shrink-0 text-mint-deep" aria-hidden />
                {profile.address}
              </span>
            ) : null}
            {profile.whatsapp ? (
              <a
                href={whatsappLink(profile.whatsapp)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-mint-deep transition hover:text-teal-900 hover:underline"
              >
                <MessageCircle className="size-4 shrink-0" aria-hidden />
                Falar no WhatsApp
              </a>
            ) : null}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        {step !== 'done' ? <StepPills steps={stepStatus} onJump={jumpToCompletedStep} /> : null}

        {error && step !== 'done' ? (
          <div className="mb-4">
            <Alert>{error}</Alert>
          </div>
        ) : null}

        {step === 'service' ? (
          <section aria-labelledby="step-service" className="animate-fade-up">
            <h1 id="step-service" className="font-display text-2xl font-semibold text-ink">
              O que você gostaria?
            </h1>
            <p className="mt-2 text-sm text-muted">Toque no serviço para seguir.</p>
            <ul className="mt-6 space-y-3">
              {(profile.services || []).length === 0 ? (
                <EmptyState title="Ainda sem serviços">
                  Este negócio ainda não publicou opções. Tente novamente em breve.
                </EmptyState>
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
              Com quem você prefere?
            </h1>
            <p className="mt-2 text-sm text-muted">
              Serviço: <strong className="text-ink">{service.name}</strong>
            </p>
            <ul className="mt-6 space-y-3">
              <li>
                <ChoiceCard
                  title="Sem preferência"
                  subtitle="Quem estiver livre no horário"
                  onSelect={() => {
                    setProfessional('any');
                    setSlot(null);
                    setStep('when');
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
                      setStep('when');
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

        {step === 'when' && service ? (
          <section aria-labelledby="step-when" className="animate-fade-up">
            <h1 id="step-when" className="font-display text-2xl font-semibold text-ink">
              Quando combina melhor?
            </h1>
            <p className="mt-2 text-sm text-muted">
              {service.name}
              {professionalLabel ? ` · ${professionalLabel}` : ''}
            </p>

            <div className="mt-5">
              <p className="mb-2 text-sm font-medium text-ink-soft">Escolha o dia</p>
              <div
                role="listbox"
                aria-label="Dias disponíveis"
                className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                {dateChips.map((chip) => {
                  const selected = date === chip.ymd;
                  return (
                    <button
                      key={chip.ymd}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => selectDate(chip.ymd)}
                      className={`flex min-h-11 min-w-[4.25rem] shrink-0 flex-col items-center justify-center rounded-2xl px-3 py-2 text-center transition focus-visible:ring-2 focus-visible:ring-mint-deep ${
                        selected
                          ? 'bg-ink text-white shadow-[var(--shadow-primary)]'
                          : 'bg-white text-ink ring-1 ring-line hover:ring-mint-deep/40'
                      }`}
                    >
                      <span
                        className={`text-[10px] font-semibold uppercase tracking-wide ${
                          selected ? 'text-mint' : 'text-muted'
                        }`}
                      >
                        {chip.hint}
                      </span>
                      <span className="font-display text-lg font-semibold leading-tight">
                        {chip.dayNum}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="mt-3 max-w-xs">
                <Field label="Outra data" id="booking-date">
                  <Input
                    id="booking-date"
                    type="date"
                    min={minDate}
                    value={date}
                    onChange={(e) => selectDate(e.target.value)}
                  />
                </Field>
              </div>
            </div>

            <div className="mt-6">
              <p className="mb-1 flex items-center gap-2 text-sm font-medium text-ink-soft">
                <Clock className="size-4 text-mint-deep" aria-hidden />
                Horários em {formatDate(date, timezone)}
              </p>
              {slotsLoading ? (
                <SlotsSkeleton />
              ) : slots.length === 0 ? (
                <div className="mt-4 space-y-5">
                  <EmptyState
                    title="Esse dia está cheio"
                    action={
                      nextOpenDate ? (
                        <Button type="button" onClick={() => selectDate(nextOpenDate)}>
                          Ver {formatDate(nextOpenDate, timezone)}
                        </Button>
                      ) : undefined
                    }
                  >
                    <p>Que tal outro dia? Ou entre na lista e avisamos se abrir vaga.</p>
                    {nextOpenBusy ? (
                      <p className="mt-3">Procurando o próximo dia livre…</p>
                    ) : !nextOpenDate ? (
                      <p className="mt-3">
                        Não achamos vaga nos próximos 14 dias. Experimente outra data ou a lista de
                        espera.
                      </p>
                    ) : (
                      <p className="mt-3">Encontramos um dia com horário livre.</p>
                    )}
                  </EmptyState>

                  <section
                    aria-labelledby="waitlist-title"
                    className="rounded-2xl bg-gradient-to-br from-success-bg/80 via-paper to-paper p-5 ring-1 ring-line/70 sm:p-6"
                  >
                    <h2 id="waitlist-title" className="font-display text-lg font-semibold text-ink">
                      Quer que a gente avise?
                    </h2>
                    {wlResult ? (
                      <div className="mt-4">
                        <Alert tone="success">
                          {wlResult === 'already'
                            ? 'Você já está na lista deste dia. Avisamos se abrir horário.'
                            : 'Pronto! Entramos com seu contato na lista de espera.'}
                        </Alert>
                      </div>
                    ) : (
                      <form onSubmit={joinWaitlist} className="mt-4 space-y-4" noValidate>
                        <p className="text-sm text-muted">
                          Deixe um WhatsApp e avisamos se abrir horário em{' '}
                          <strong className="text-ink">{formatDate(date, timezone)}</strong>.
                        </p>
                        <Field label="Seu nome" id="wl-name">
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
                        <Button
                          type="submit"
                          disabled={wlBusy || !wlName.trim() || !wlPhone.trim()}
                          loading={wlBusy}
                        >
                          Entrar na lista de espera
                        </Button>
                      </form>
                    )}
                  </section>
                </div>
              ) : (
                <SlotListbox
                  slots={slots}
                  value={slot}
                  onChange={selectSlot}
                  timezone={timezone}
                />
              )}
            </div>

            <div className="mt-6">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setStep(hasProfessionalStep ? 'professional' : 'service')}
              >
                Voltar
              </Button>
            </div>
          </section>
        ) : null}

        {step === 'details' && service && slot ? (
          <section aria-labelledby="step-form" className="animate-fade-up">
            <h1 id="step-form" className="font-display text-2xl font-semibold text-ink">
              Quase lá — seus dados
            </h1>
            <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="size-3.5 text-mint-deep" aria-hidden />
                {formatDate(date, timezone)} · {formatTime(slot, timezone)}
              </span>
              <span aria-hidden>·</span>
              <span>{service.name}</span>
              {professionalLabel ? (
                <>
                  <span aria-hidden>·</span>
                  <span className="inline-flex items-center gap-1">
                    <User className="size-3.5" aria-hidden />
                    {professionalLabel}
                  </span>
                </>
              ) : null}
            </p>
            <form
              onSubmit={submitBooking}
              className="surface-elevated mt-6 space-y-4 rounded-2xl p-5 sm:p-6"
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
              <Field label="Alguma observação? (opcional)" id="notes">
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  maxLength={500}
                  placeholder="Ex.: preferência de horário, alergia, etc."
                />
              </Field>
              <div className="flex flex-wrap gap-2 pt-2">
                <Button type="button" variant="secondary" onClick={() => setStep('when')}>
                  Voltar
                </Button>
                <Button type="submit" disabled={submitting} loading={submitting}>
                  Confirmar agendamento
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
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-success-bg via-paper to-mint/20 p-6 ring-1 ring-mint-deep/20 sm:p-8">
              <div
                className="pointer-events-none absolute -right-8 -top-8 size-32 rounded-full bg-mint/30 blur-2xl"
                aria-hidden
              />
              <div className="relative text-center sm:text-left">
                <span className="inline-flex size-14 items-center justify-center rounded-2xl bg-mint-deep text-white shadow-[var(--shadow-primary)]">
                  <CheckCircle2 className="size-8" aria-hidden />
                </span>
                <h1
                  id="step-done"
                  className="mt-4 font-display text-2xl font-semibold text-ink sm:text-3xl"
                >
                  {bookResult.pix ? 'Quase lá — pague o sinal' : 'Tudo certo! Até logo'}
                </h1>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  {bookResult.pix
                    ? 'Recebemos seu pedido. O horário fica confirmado depois do PIX.'
                    : `${profile.name} já recebeu seu horário. Guarde o link abaixo para remarcar ou cancelar.`}
                </p>
              </div>
            </div>

            {bookResult.pix ? (
              <Alert tone="info">
                O horário só é confirmado após o pagamento do sinal via PIX.
              </Alert>
            ) : null}

            <dl className="grid gap-4 rounded-2xl bg-white/90 p-5 ring-1 ring-line/80 sm:grid-cols-2 sm:p-6">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Serviço
                </dt>
                <dd className="mt-1 font-medium text-ink">{service?.name}</dd>
                {service ? (
                  <dd className="mt-0.5 text-sm text-muted">
                    {service.durationMinutes} min · {formatBRL(service.priceCents)}
                  </dd>
                ) : null}
              </div>
              {professionalLabel ? (
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-muted">
                    Profissional
                  </dt>
                  <dd className="mt-1 font-medium text-ink">{professionalLabel}</dd>
                </div>
              ) : null}
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Quando</dt>
                <dd className="mt-1 font-medium text-ink">
                  {slot ? `${formatDate(date, timezone)} às ${formatTime(slot, timezone)}` : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Cliente</dt>
                <dd className="mt-1 font-medium text-ink">{clientName}</dd>
                {clientPhone ? <dd className="mt-0.5 text-sm text-muted">{clientPhone}</dd> : null}
              </div>
              {profile.address ? (
                <div className="sm:col-span-2">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-muted">
                    Onde
                  </dt>
                  <dd className="mt-1 font-medium text-ink">{profile.address}</dd>
                </div>
              ) : null}
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

            <div className="rounded-2xl bg-ink p-5 text-white sm:p-6">
              <h2 className="font-display text-lg font-semibold">Seu link pessoal</h2>
              <p className="mt-1 text-sm text-white/70">
                Confirme presença, remarque ou cancele quando precisar.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <a
                  href={bookResult.manageUrl}
                  className="break-all text-sm font-semibold text-mint hover:underline"
                >
                  Abrir meu agendamento
                </a>
                <CopyButton value={bookResult.manageUrl} label="Copiar link" />
              </div>
            </div>
          </section>
        ) : null}

        {(profile.reviews || []).length > 0 && step === 'service' ? (
          <section
            aria-labelledby="reviews-title"
            className="mt-14 border-t border-line/80 pt-10"
          >
            <h2 id="reviews-title" className="font-display text-xl font-semibold text-ink">
              O que dizem os clientes
            </h2>
            <ul className="mt-5 space-y-3">
              {profile.reviews.map((r, i) => (
                <li key={i} className="surface-elevated rounded-2xl p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-ink">{r.clientName || 'Cliente'}</p>
                    <Stars value={r.rating} />
                  </div>
                  {r.comment ? (
                    <p className="mt-2 text-sm leading-relaxed text-ink-muted">{r.comment}</p>
                  ) : null}
                  <p className="mt-2 text-xs text-muted">{formatDate(r.createdAt, timezone)}</p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </main>
    </div>
  );
}
