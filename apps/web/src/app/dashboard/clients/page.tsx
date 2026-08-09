'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Button,
  EmptyState,
  Field,
  Input,
  PageTitle,
  Spinner,
  StatusBadge,
  Textarea,
} from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { formatBRL, formatDateTime, whatsappLink } from '@/lib/format';
import type { AuthUserPayload, ClientDetail, ClientListResponse } from '@/lib/types';

const PAGE_SIZE = 20;

export default function ClientsPage() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ClientListResponse | null>(null);
  const [timezone, setTimezone] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ClientDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [notes, setNotes] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);

  // Busca com debounce
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    void api<AuthUserPayload>('/api/auth/me')
      .then((me) => setTimezone(me.tenant?.timezone))
      .catch(() => null);
  }, []);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (debouncedSearch) qs.set('search', debouncedSearch);
      const res = await api<ClientListResponse>(`/api/clients?${qs.toString()}`);
      setData(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao carregar clientes.');
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const openDetail = useCallback(async (id: string) => {
    setSelectedId(id);
    setDetailLoading(true);
    setNotesSaved(false);
    setError(null);
    try {
      const res = await api<ClientDetail>(`/api/clients/${id}`);
      setDetail(res);
      setNotes(res.notes || '');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao carregar o cliente.');
      setSelectedId(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  async function saveNotes() {
    if (!selectedId) return;
    setSavingNotes(true);
    setNotesSaved(false);
    setError(null);
    try {
      await api(`/api/clients/${selectedId}/notes`, {
        method: 'PATCH',
        body: { notes: notes.trim() || undefined },
      });
      setNotesSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível salvar as anotações.');
    } finally {
      setSavingNotes(false);
    }
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  // ---- Detalhe do cliente ----
  if (selectedId) {
    return (
      <div>
        <Button
          type="button"
          variant="ghost"
          className="mb-6 -ml-3"
          onClick={() => {
            setSelectedId(null);
            setDetail(null);
          }}
        >
          ← Voltar para a lista
        </Button>

        {error ? (
          <div className="mb-4">
            <Alert>{error}</Alert>
          </div>
        ) : null}

        {detailLoading || !detail ? (
          <Spinner label="Carregando cliente…" />
        ) : (
          <div>
            <PageTitle title={detail.name} description="Histórico e anotações do cliente." />

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-lg bg-white/80 p-5 ring-1 ring-stone-200 sm:col-span-2">
                <h2 className="font-display text-lg font-semibold text-stone-900">Contato</h2>
                <dl className="mt-3 space-y-2 text-sm">
                  <div className="flex gap-2">
                    <dt className="w-24 text-stone-500">WhatsApp</dt>
                    <dd className="font-medium text-stone-900">
                      <a
                        href={whatsappLink(detail.phone)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-emerald-800 hover:underline"
                      >
                        {detail.phone}
                      </a>
                    </dd>
                  </div>
                  {detail.email ? (
                    <div className="flex gap-2">
                      <dt className="w-24 text-stone-500">E-mail</dt>
                      <dd className="font-medium text-stone-900">{detail.email}</dd>
                    </div>
                  ) : null}
                  <div className="flex gap-2">
                    <dt className="w-24 text-stone-500">Cliente desde</dt>
                    <dd className="font-medium text-stone-900">
                      {formatDateTime(detail.createdAt, timezone)}
                    </dd>
                  </div>
                </dl>
              </div>
              <div className="rounded-lg bg-white/80 p-5 ring-1 ring-stone-200">
                <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                  Pontos de fidelidade
                </p>
                <p className="mt-2 font-display text-3xl text-stone-900">{detail.loyaltyPoints}</p>
              </div>
            </div>

            <section className="mt-8 rounded-lg bg-white/80 p-5 ring-1 ring-stone-200">
              <h2 className="font-display text-lg font-semibold text-stone-900">Anotações</h2>
              <p className="mt-1 text-sm text-stone-600">
                Preferências, alergias, histórico… visível apenas para a equipe.
              </p>
              <div className="mt-3">
                <label htmlFor="client-notes" className="sr-only">
                  Anotações do cliente
                </label>
                <Textarea
                  id="client-notes"
                  value={notes}
                  onChange={(e) => {
                    setNotes(e.target.value);
                    setNotesSaved(false);
                  }}
                  maxLength={2000}
                />
              </div>
              <div className="mt-3 flex items-center gap-3">
                <Button type="button" onClick={() => void saveNotes()} disabled={savingNotes}>
                  {savingNotes ? 'Salvando…' : 'Salvar anotações'}
                </Button>
                {notesSaved ? <span className="text-sm text-emerald-800">Salvo!</span> : null}
              </div>
            </section>

            <section className="mt-8">
              <h2 className="font-display text-xl font-semibold text-stone-900">
                Histórico de agendamentos
              </h2>
              {detail.appointments.length === 0 ? (
                <div className="mt-4">
                  <EmptyState>Nenhum agendamento registrado.</EmptyState>
                </div>
              ) : (
                <ul className="mt-4 divide-y divide-stone-200 overflow-hidden rounded-lg bg-white ring-1 ring-stone-200">
                  {detail.appointments.map((a) => (
                    <li
                      key={a.id}
                      className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="font-medium text-stone-900">{a.service?.name || 'Serviço'}</p>
                        <p className="text-sm text-stone-600">
                          {formatDateTime(a.startsAt, timezone)}
                          {a.professional?.name ? ` · ${a.professional.name}` : ''}
                        </p>
                      </div>
                      <StatusBadge status={a.status} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </div>
    );
  }

  // ---- Lista ----
  return (
    <div>
      <PageTitle
        title="Clientes"
        description="Sua base de clientes com histórico, gastos e faltas."
      />

      <div className="mb-6 max-w-md">
        <Field label="Buscar" id="client-search" hint="Nome, telefone ou e-mail.">
          <Input
            id="client-search"
            type="search"
            value={search}
            placeholder="Ex: Maria, 11999998888…"
            onChange={(e) => setSearch(e.target.value)}
          />
        </Field>
      </div>

      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      {loading ? (
        <Spinner />
      ) : !data || data.items.length === 0 ? (
        <EmptyState>
          {debouncedSearch
            ? 'Nenhum cliente encontrado para esta busca.'
            : 'Nenhum cliente ainda. Eles aparecem aqui após o primeiro agendamento.'}
        </EmptyState>
      ) : (
        <>
          <ul className="space-y-3">
            {data.items.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => void openDetail(c.id)}
                  className="w-full rounded-lg bg-white p-4 text-left ring-1 ring-stone-200 transition hover:ring-emerald-600 focus-visible:ring-2 focus-visible:ring-emerald-700"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-semibold text-stone-900">{c.name}</p>
                      <p className="text-sm text-stone-600">
                        {c.phone}
                        {c.email ? ` · ${c.email}` : ''}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-stone-600">
                      <span>
                        <strong className="text-stone-900">{c.completedCount}</strong> visitas
                      </span>
                      <span>
                        <strong className="text-stone-900">{formatBRL(c.totalSpentCents)}</strong>{' '}
                        gastos
                      </span>
                      {c.noShowCount > 0 ? (
                        <span className="text-orange-700">
                          <strong>{c.noShowCount}</strong> falta{c.noShowCount > 1 ? 's' : ''}
                        </span>
                      ) : null}
                      {c.lastVisit ? (
                        <span>Última visita {formatDateTime(c.lastVisit, timezone)}</span>
                      ) : null}
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>

          <div className="mt-6 flex items-center justify-between">
            <p className="text-sm text-stone-600">
              {data.total} cliente{data.total === 1 ? '' : 's'} · página {data.page} de {totalPages}
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Anterior
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Próxima
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
