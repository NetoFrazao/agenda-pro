'use client';

import { FormEvent, useEffect, useState } from 'react';
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
import { dayName, formatDate, minutesToTime, timeToMinutes, todayYmd } from '@/lib/format';
import type { AvailabilityException, AvailabilityRule } from '@/lib/types';

type ExceptionKind = 'block' | 'window';

export default function AvailabilityPage() {
  const [rules, setRules] = useState<AvailabilityRule[]>([]);
  const [dayOfWeek, setDayOfWeek] = useState('1');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('18:00');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Folgas e feriados (exceções pontuais)
  const [exceptions, setExceptions] = useState<AvailabilityException[]>([]);
  const [excDate, setExcDate] = useState(todayYmd());
  const [excKind, setExcKind] = useState<ExceptionKind>('block');
  const [excStart, setExcStart] = useState('09:00');
  const [excEnd, setExcEnd] = useState('13:00');
  const [excReason, setExcReason] = useState('');
  const [excSaving, setExcSaving] = useState(false);
  const [excError, setExcError] = useState<string | null>(null);

  async function load() {
    const [rulesData, excData] = await Promise.all([
      api<AvailabilityRule[]>('/api/availability/rules'),
      api<AvailabilityException[]>('/api/availability/exceptions'),
    ]);
    setRules(Array.isArray(rulesData) ? rulesData : []);
    setExceptions(Array.isArray(excData) ? excData : []);
  }

  useEffect(() => {
    void load()
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : 'Erro ao carregar disponibilidade.'),
      )
      .finally(() => setLoading(false));
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const startMinute = timeToMinutes(startTime);
      const endMinute = timeToMinutes(endTime);
      if (endMinute <= startMinute) {
        throw new ApiError(400, 'Horário final deve ser depois do inicial.');
      }
      await api('/api/availability/rules', {
        method: 'POST',
        body: {
          dayOfWeek: Number(dayOfWeek),
          startMinute,
          endMinute,
        },
      });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível salvar a regra.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm('Remover esta regra?')) return;
    try {
      await api(`/api/availability/rules/${id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível remover.');
    }
  }

  async function submitException(e: FormEvent) {
    e.preventDefault();
    setExcSaving(true);
    setExcError(null);
    try {
      if (excKind === 'window') {
        const startMinute = timeToMinutes(excStart);
        const endMinute = timeToMinutes(excEnd);
        if (endMinute <= startMinute) {
          throw new ApiError(400, 'Horário final deve ser depois do inicial.');
        }
        await api('/api/availability/exceptions', {
          method: 'POST',
          body: {
            date: excDate,
            isAvailable: true,
            startMinute,
            endMinute,
            reason: excReason.trim() || undefined,
          },
        });
      } else {
        await api('/api/availability/exceptions', {
          method: 'POST',
          body: {
            date: excDate,
            isAvailable: false,
            reason: excReason.trim() || undefined,
          },
        });
      }
      setExcReason('');
      await load();
    } catch (err) {
      setExcError(err instanceof ApiError ? err.message : 'Não foi possível salvar a exceção.');
    } finally {
      setExcSaving(false);
    }
  }

  async function removeException(id: string) {
    if (!confirm('Remover esta exceção?')) return;
    setExcError(null);
    try {
      await api(`/api/availability/exceptions/${id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setExcError(err instanceof ApiError ? err.message : 'Não foi possível remover.');
    }
  }

  if (loading) return <Spinner />;

  const sorted = [...rules].sort(
    (a, b) => a.dayOfWeek - b.dayOfWeek || a.startMinute - b.startMinute,
  );

  return (
    <div>
      <PageTitle
        title="Disponibilidade"
        description="Defina os dias e horários em que você atende (fuso do estabelecimento)."
      />
      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      <form
        onSubmit={onSubmit}
        className="mb-10 grid gap-4 surface-elevated rounded-2xl p-5 sm:grid-cols-4"
      >
        <Field label="Dia da semana" id="day">
          <Select id="day" value={dayOfWeek} onChange={(e) => setDayOfWeek(e.target.value)}>
            {[0, 1, 2, 3, 4, 5, 6].map((d) => (
              <option key={d} value={d}>
                {dayName(d)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Início" id="start">
          <Input
            id="start"
            type="time"
            required
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
          />
        </Field>
        <Field label="Fim" id="end">
          <Input
            id="end"
            type="time"
            required
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
          />
        </Field>
        <div className="flex items-end">
          <Button type="submit" fullWidth disabled={saving}>
            {saving ? 'Salvando…' : 'Adicionar'}
          </Button>
        </div>
      </form>

      {sorted.length === 0 ? (
        <EmptyState
          title="Sem horários de atendimento"
          action={
            <Button
              type="button"
              variant="secondary"
              onClick={() => document.getElementById('day')?.focus()}
            >
              Definir primeiro horário
            </Button>
          }
        >
          Sem regras semanais, a página pública não mostra vagas. Use o formulário acima.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-white ring-1 ring-line">
          {sorted.map((rule) => (
            <li key={rule.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div>
                <p className="font-medium text-ink">{dayName(rule.dayOfWeek)}</p>
                <p className="text-sm text-muted">
                  {minutesToTime(rule.startMinute)} – {minutesToTime(rule.endMinute)}
                  {!rule.isActive ? ' · inativa' : ''}
                </p>
              </div>
              <Button type="button" variant="danger" onClick={() => remove(rule.id)}>
                Remover
              </Button>
            </li>
          ))}
        </ul>
      )}

      <section className="mt-14" aria-labelledby="exceptions-title">
        <h2 id="exceptions-title" className="font-display text-xl font-semibold text-ink">
          Folgas e feriados
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Bloqueie dias inteiros (folga, feriado) ou abra uma janela especial de atendimento em um
          dia específico. Exceções têm prioridade sobre as regras semanais.
        </p>

        {excError ? (
          <div className="mt-4">
            <Alert>{excError}</Alert>
          </div>
        ) : null}

        <form
          onSubmit={submitException}
          className="mt-5 grid gap-4 surface-elevated rounded-2xl p-5 sm:grid-cols-2 lg:grid-cols-6"
        >
          <Field label="Data" id="exc-date">
            <Input
              id="exc-date"
              type="date"
              required
              value={excDate}
              onChange={(e) => setExcDate(e.target.value)}
            />
          </Field>
          <Field label="Tipo" id="exc-kind">
            <Select
              id="exc-kind"
              value={excKind}
              onChange={(e) => setExcKind(e.target.value as ExceptionKind)}
            >
              <option value="block">Bloquear o dia (folga/feriado)</option>
              <option value="window">Janela especial de atendimento</option>
            </Select>
          </Field>
          {excKind === 'window' ? (
            <>
              <Field label="Início" id="exc-start">
                <Input
                  id="exc-start"
                  type="time"
                  required
                  value={excStart}
                  onChange={(e) => setExcStart(e.target.value)}
                />
              </Field>
              <Field label="Fim" id="exc-end">
                <Input
                  id="exc-end"
                  type="time"
                  required
                  value={excEnd}
                  onChange={(e) => setExcEnd(e.target.value)}
                />
              </Field>
            </>
          ) : null}
          <Field label="Motivo (opcional)" id="exc-reason">
            <Input
              id="exc-reason"
              value={excReason}
              maxLength={255}
              placeholder="Ex: Feriado, consulta médica…"
              onChange={(e) => setExcReason(e.target.value)}
            />
          </Field>
          <div className="flex items-end">
            <Button type="submit" fullWidth disabled={excSaving}>
              {excSaving ? 'Salvando…' : 'Adicionar exceção'}
            </Button>
          </div>
        </form>

        <div className="mt-5">
          {exceptions.length === 0 ? (
            <EmptyState title="Nenhuma folga cadastrada">
              Use o formulário acima para bloquear feriados ou abrir janelas especiais.
            </EmptyState>
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-white ring-1 ring-line">
              {exceptions.map((exc) => (
                <li key={exc.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <p className="flex flex-wrap items-center gap-2 font-medium text-ink">
                      {formatDate(exc.date.slice(0, 10))}
                      <Badge tone={exc.isAvailable ? 'emerald' : 'red'}>
                        {exc.isAvailable
                          ? `Janela especial ${minutesToTime(exc.startMinute ?? 0)} – ${minutesToTime(exc.endMinute ?? 0)}`
                          : 'Dia bloqueado'}
                      </Badge>
                    </p>
                    {exc.reason ? <p className="text-sm text-muted">{exc.reason}</p> : null}
                  </div>
                  <Button
                    type="button"
                    variant="danger"
                    onClick={() => void removeException(exc.id)}
                  >
                    Remover
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
