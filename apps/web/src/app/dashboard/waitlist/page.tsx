'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  Field,
  Input,
  PageTitle,
  Spinner,
} from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { formatDate, formatDateTime, whatsappLink } from '@/lib/format';
import type { WaitlistEntry } from '@/lib/types';

export default function WaitlistPage() {
  const [date, setDate] = useState('');
  const [items, setItems] = useState<WaitlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const load = useCallback(async (filterDate: string) => {
    setLoading(true);
    setError(null);
    try {
      const qs = filterDate ? `?date=${encodeURIComponent(filterDate)}` : '';
      const data = await api<WaitlistEntry[]>(`/api/waitlist${qs}`);
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao carregar a lista de espera.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(date);
  }, [load, date]);

  async function remove(entry: WaitlistEntry) {
    if (!confirm(`Remover ${entry.clientName} da lista de espera?`)) return;
    setRemovingId(entry.id);
    setError(null);
    try {
      await api(`/api/waitlist/${entry.id}`, { method: 'DELETE' });
      await load(date);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível remover.');
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div>
      <PageTitle
        title="Lista de espera"
        description="Clientes aguardando vaga em dias lotados. Eles são avisados automaticamente quando um horário abre."
      />

      <div className="mb-6 flex flex-col gap-3 rounded-lg bg-white/80 p-4 ring-1 ring-stone-200 sm:flex-row sm:items-end">
        <Field label="Filtrar por dia" id="wl-date">
          <Input id="wl-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        {date ? (
          <Button type="button" variant="secondary" onClick={() => setDate('')}>
            Limpar filtro
          </Button>
        ) : null}
      </div>

      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      {loading ? (
        <Spinner />
      ) : items.length === 0 ? (
        <EmptyState>
          {date ? 'Ninguém na lista de espera para este dia.' : 'Ninguém na lista de espera.'}
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {items.map((entry) => (
            <li
              key={entry.id}
              className="flex flex-col gap-3 rounded-lg bg-white p-4 ring-1 ring-stone-200 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="flex flex-wrap items-center gap-2 font-semibold text-stone-900">
                  {entry.clientName}
                  <Badge tone={entry.status === 'NOTIFIED' ? 'sky' : 'amber'}>
                    {entry.status === 'NOTIFIED' ? 'Avisado' : 'Aguardando'}
                  </Badge>
                </p>
                <p className="mt-1 text-sm text-stone-600">
                  Quer atendimento em <strong>{formatDate(entry.dateKey)}</strong>
                </p>
                <p className="mt-1 text-sm text-stone-500">
                  {entry.clientPhone}
                  {entry.clientEmail ? ` · ${entry.clientEmail}` : ''} · entrou em{' '}
                  {formatDateTime(entry.createdAt)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <a
                  href={whatsappLink(entry.clientPhone)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-md bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800"
                >
                  Chamar no WhatsApp
                </a>
                <Button
                  type="button"
                  variant="danger"
                  disabled={removingId === entry.id}
                  onClick={() => void remove(entry)}
                >
                  {removingId === entry.id ? 'Removendo…' : 'Remover'}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
