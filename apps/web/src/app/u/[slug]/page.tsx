'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { BrandLogo } from '@/components/BrandLogo';
import { Alert, Button, EmptyState, Field, Input, Spinner, Textarea } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { formatBRL, formatDate, formatTime } from '@/lib/format';
import type { BookAppointmentPayload, PublicTenantProfile, Service } from '@/lib/types';

type Step = 1 | 2 | 3 | 4 | 5;

const STEP_LABELS = ['Serviço', 'Dia', 'Horário', 'Seus dados', 'Confirmação'] as const;

function todayYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function PublicBookingPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  const [profile, setProfile] = useState<PublicTenantProfile | null>(null);
  const [step, setStep] = useState<Step>(1);
  const [service, setService] = useState<Service | null>(null);
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
  const [booked, setBooked] = useState(false);

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

  useEffect(() => {
    if (step !== 3 || !service || !date) return;
    let cancelled = false;
    setSlotsLoading(true);
    setError(null);
    void api<string[] | { slots: string[] }>(
      `/api/public/${slug}/slots?serviceId=${encodeURIComponent(service.id)}&date=${encodeURIComponent(date)}`,
      { auth: false },
    )
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
  }, [step, service, date, slug]);

  const timezone = profile?.timezone;

  const stepStatus = useMemo(() => {
    return STEP_LABELS.map((label, i) => {
      const n = (i + 1) as Step;
      return {
        label,
        n,
        current: step === n,
        complete: step > n,
      };
    });
  }, [step]);

  async function submitBooking(e: FormEvent) {
    e.preventDefault();
    if (!service || !slot) return;
    setSubmitting(true);
    setError(null);
    try {
      const payload: BookAppointmentPayload = {
        serviceId: service.id,
        startsAt: slot,
        clientName: clientName.trim(),
        clientPhone: clientPhone.trim(),
        clientEmail: clientEmail.trim() || undefined,
        notes: notes.trim() || undefined,
      };
      await api(`/api/public/${slug}/book`, {
        method: 'POST',
        auth: false,
        body: payload,
      });
      setBooked(true);
      setStep(5);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível concluir o agendamento.');
    } finally {
      setSubmitting(false);
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

  return (
    <div className="flex min-h-screen flex-col bg-atmosphere">
      <header className="border-b border-stone-200/70 bg-white/50 px-6 py-5 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-4">
          <div>
            <p className="font-display text-2xl font-semibold text-stone-900">{profile.name}</p>
            <p className="text-sm text-stone-500">Agendamento online</p>
          </div>
          <BrandLogo href="/" size="sm" className="!text-base opacity-70" />
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-8">
        <nav aria-label="Etapas do agendamento" className="mb-8">
          <ol className="flex flex-wrap gap-2">
            {stepStatus.map((s) => (
              <li key={s.n}>
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

        {error && step !== 5 ? (
          <div className="mb-4">
            <Alert>{error}</Alert>
          </div>
        ) : null}

        {step === 1 ? (
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
                        setSlot(null);
                        setStep(2);
                      }}
                    >
                      <p className="font-semibold text-stone-900">{s.name}</p>
                      <p className="mt-1 text-sm text-stone-600">
                        {s.durationMinutes} min · {formatBRL(s.priceCents)}
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

        {step === 2 && service ? (
          <section aria-labelledby="step-day">
            <h1 id="step-day" className="font-display text-2xl font-semibold text-stone-900">
              Escolha o dia
            </h1>
            <p className="mt-2 text-sm text-stone-600">
              Serviço: <strong>{service.name}</strong>
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
                  }}
                />
              </Field>
            </div>
            <div className="mt-6 flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={() => setStep(1)}>
                Voltar
              </Button>
              <Button
                type="button"
                onClick={() => {
                  setSlot(null);
                  setStep(3);
                }}
                disabled={!date}
              >
                Ver horários
              </Button>
            </div>
          </section>
        ) : null}

        {step === 3 && service ? (
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
              <div className="mt-6">
                <EmptyState>Nenhum horário livre neste dia. Tente outra data.</EmptyState>
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
              <Button type="button" variant="secondary" onClick={() => setStep(2)}>
                Voltar
              </Button>
              <Button type="button" disabled={!slot} onClick={() => setStep(4)}>
                Continuar
              </Button>
            </div>
          </section>
        ) : null}

        {step === 4 && service && slot ? (
          <section aria-labelledby="step-form">
            <h1 id="step-form" className="font-display text-2xl font-semibold text-stone-900">
              Seus dados
            </h1>
            <p className="mt-2 text-sm text-stone-600">
              {service.name} · {formatDate(date, timezone)} · {formatTime(slot, timezone)}
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
                <Button type="button" variant="secondary" onClick={() => setStep(3)}>
                  Voltar
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? 'Confirmando…' : 'Confirmar agendamento'}
                </Button>
              </div>
            </form>
          </section>
        ) : null}

        {step === 5 ? (
          <section aria-labelledby="step-done" aria-live="polite">
            <h1 id="step-done" className="font-display text-2xl font-semibold text-stone-900">
              {booked ? 'Agendamento confirmado' : 'Resumo'}
            </h1>
            {booked ? (
              <Alert tone="success">
                Pronto! {profile.name} recebeu seu pedido. Guarde o horário e, se precisar remarcar,
                fale com o estabelecimento.
              </Alert>
            ) : null}
            <dl className="mt-6 space-y-3 rounded-lg bg-white p-5 text-sm ring-1 ring-stone-200">
              <div>
                <dt className="text-stone-500">Serviço</dt>
                <dd className="font-medium text-stone-900">{service?.name}</dd>
              </div>
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
          </section>
        ) : null}
      </main>
    </div>
  );
}
