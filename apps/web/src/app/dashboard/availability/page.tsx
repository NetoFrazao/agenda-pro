'use client';

import { FormEvent, useEffect, useState } from 'react';
import {
  Alert,
  Button,
  EmptyState,
  Field,
  Input,
  PageTitle,
  Select,
  Spinner,
} from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { dayName, minutesToTime, timeToMinutes } from '@/lib/format';
import type { AvailabilityRule } from '@/lib/types';

export default function AvailabilityPage() {
  const [rules, setRules] = useState<AvailabilityRule[]>([]);
  const [dayOfWeek, setDayOfWeek] = useState('1');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('18:00');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const data = await api<AvailabilityRule[]>('/api/availability/rules');
    setRules(Array.isArray(data) ? data : []);
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
        className="mb-10 grid gap-4 rounded-lg bg-white/80 p-5 ring-1 ring-stone-200 sm:grid-cols-4"
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
        <EmptyState>
          Nenhuma regra de disponibilidade. Sem regras, a página pública não terá horários.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-stone-200 overflow-hidden rounded-lg bg-white ring-1 ring-stone-200">
          {sorted.map((rule) => (
            <li key={rule.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div>
                <p className="font-medium text-stone-900">{dayName(rule.dayOfWeek)}</p>
                <p className="text-sm text-stone-600">
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
    </div>
  );
}
