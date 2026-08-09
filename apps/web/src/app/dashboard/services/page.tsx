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
  Textarea,
} from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { formatBRL } from '@/lib/format';
import type { Service } from '@/lib/types';

type FormState = {
  name: string;
  description: string;
  durationMinutes: string;
  priceReais: string;
  depositReais: string;
};

const emptyForm: FormState = {
  name: '',
  description: '',
  durationMinutes: '30',
  priceReais: '50',
  depositReais: '0',
};

export default function ServicesPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function load() {
    setError(null);
    const data = await api<Service[]>('/api/services');
    setServices(Array.isArray(data) ? data : []);
  }

  useEffect(() => {
    void load()
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : 'Erro ao carregar serviços.'),
      )
      .finally(() => setLoading(false));
  }, []);

  function startEdit(service: Service) {
    setEditingId(service.id);
    setForm({
      name: service.name,
      description: service.description || '',
      durationMinutes: String(service.durationMinutes),
      priceReais: (service.priceCents / 100).toFixed(2).replace('.', ','),
      depositReais: ((service.depositCents ?? 0) / 100).toFixed(2).replace('.', ','),
    });
    setSuccess(null);
  }

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const priceNormalized = form.priceReais.replace(/\./g, '').replace(',', '.');
      const priceCents = Math.round(parseFloat(priceNormalized) * 100);
      const depositNormalized = form.depositReais.replace(/\./g, '').replace(',', '.');
      const depositCents = Math.round(parseFloat(depositNormalized || '0') * 100);
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        durationMinutes: Number(form.durationMinutes),
        priceCents,
        depositCents: Number.isFinite(depositCents) ? Math.max(0, depositCents) : 0,
      };

      if (editingId) {
        await api(`/api/services/${editingId}`, { method: 'PATCH', body: payload });
        setSuccess('Serviço atualizado.');
      } else {
        await api('/api/services', { method: 'POST', body: payload });
        setSuccess('Serviço criado.');
      }
      resetForm();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm('Excluir este serviço?')) return;
    setError(null);
    try {
      await api(`/api/services/${id}`, { method: 'DELETE' });
      if (editingId === id) resetForm();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível excluir.');
    }
  }

  async function toggleActive(service: Service) {
    try {
      await api(`/api/services/${service.id}`, {
        method: 'PATCH',
        body: { isActive: !service.isActive },
      });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível atualizar.');
    }
  }

  if (loading) return <Spinner />;

  return (
    <div>
      <PageTitle
        title="Serviços"
        description="Defina o que você oferece, duração, preço e sinal (opcional)."
      />
      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}
      {success ? (
        <div className="mb-4">
          <Alert tone="success">{success}</Alert>
        </div>
      ) : null}

      <form
        onSubmit={onSubmit}
        className="mb-10 space-y-4 rounded-lg bg-white/80 p-5 ring-1 ring-stone-200"
      >
        <h2 className="font-display text-lg font-semibold text-stone-900">
          {editingId ? 'Editar serviço' : 'Novo serviço'}
        </h2>
        <Field label="Nome" id="svc-name">
          <Input
            id="svc-name"
            required
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
        </Field>
        <Field label="Descrição" id="svc-desc">
          <Textarea
            id="svc-desc"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Duração (minutos)" id="svc-duration">
            <Select
              id="svc-duration"
              value={form.durationMinutes}
              onChange={(e) => setForm((f) => ({ ...f, durationMinutes: e.target.value }))}
            >
              {[15, 30, 45, 60, 90, 120].map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Preço (R$)" id="svc-price" hint="Use vírgula para centavos, ex: 45,00">
            <Input
              id="svc-price"
              required
              inputMode="decimal"
              value={form.priceReais}
              onChange={(e) => setForm((f) => ({ ...f, priceReais: e.target.value }))}
            />
          </Field>
          <Field
            label="Sinal (R$)"
            id="svc-deposit"
            hint="0 = sem sinal. PIX online exige plano Pro/Business."
          >
            <Input
              id="svc-deposit"
              inputMode="decimal"
              value={form.depositReais}
              onChange={(e) => setForm((f) => ({ ...f, depositReais: e.target.value }))}
            />
          </Field>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={saving}>
            {saving ? 'Salvando…' : editingId ? 'Salvar alterações' : 'Adicionar serviço'}
          </Button>
          {editingId ? (
            <Button type="button" variant="secondary" onClick={resetForm}>
              Cancelar
            </Button>
          ) : null}
        </div>
      </form>

      {services.length === 0 ? (
        <EmptyState>Nenhum serviço cadastrado ainda.</EmptyState>
      ) : (
        <ul className="space-y-3">
          {services.map((s) => (
            <li
              key={s.id}
              className="flex flex-col gap-3 rounded-lg bg-white p-4 ring-1 ring-stone-200 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-semibold text-stone-900">
                  {s.name}{' '}
                  {!s.isActive ? (
                    <span className="text-xs font-medium text-stone-500">(inativo)</span>
                  ) : null}
                </p>
                <p className="text-sm text-stone-600">
                  {s.durationMinutes} min · {formatBRL(s.priceCents)}
                  {(s.depositCents ?? 0) > 0 ? ` · sinal ${formatBRL(s.depositCents ?? 0)}` : ''}
                </p>
                {s.description ? (
                  <p className="mt-1 text-sm text-stone-500">{s.description}</p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" onClick={() => startEdit(s)}>
                  Editar
                </Button>
                <Button type="button" variant="ghost" onClick={() => toggleActive(s)}>
                  {s.isActive ? 'Desativar' : 'Ativar'}
                </Button>
                <Button type="button" variant="danger" onClick={() => remove(s.id)}>
                  Excluir
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
