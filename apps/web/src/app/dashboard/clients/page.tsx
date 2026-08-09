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
  Select,
  Spinner,
  StatusBadge,
  Textarea,
} from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { formatBRL, formatDateTime, whatsappLink, type BadgeTone } from '@/lib/format';
import type {
  AuthUserPayload,
  ClientDetail,
  ClientListResponse,
  ClientSegment,
  InactiveBucket,
} from '@/lib/types';

const PAGE_SIZE = 20;

const SEGMENT_LABEL: Record<ClientSegment, string> = {
  new: 'Novo',
  frequent: 'Frequente',
  vip: 'VIP',
  inactive: 'Inativo',
  at_risk: 'Em risco',
};

const SEGMENT_TONE: Record<ClientSegment, BadgeTone> = {
  new: 'sky',
  frequent: 'emerald',
  vip: 'amber',
  inactive: 'stone',
  at_risk: 'orange',
};

const SEGMENT_OPTIONS: { value: '' | ClientSegment; label: string }[] = [
  { value: '', label: 'Todos os segmentos' },
  { value: 'new', label: 'Novo' },
  { value: 'frequent', label: 'Frequente' },
  { value: 'vip', label: 'VIP' },
  { value: 'at_risk', label: 'Em risco' },
  { value: 'inactive', label: 'Inativo' },
];

const INACTIVE_OPTIONS: { value: '' | `${InactiveBucket}`; label: string }[] = [
  { value: '', label: 'Qualquer inatividade' },
  { value: '30', label: 'Inativo há 30+ dias' },
  { value: '60', label: 'Inativo há 60+ dias' },
  { value: '90', label: 'Inativo há 90+ dias' },
];

function birthdayInputValue(iso: string | null | undefined): string {
  if (!iso) return '';
  return iso.slice(0, 10);
}

function inactiveLabel(bucket: InactiveBucket): string {
  return `${bucket}+ dias sem visita`;
}

export default function ClientsPage() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [segmentFilter, setSegmentFilter] = useState<'' | ClientSegment>('');
  const [inactiveFilter, setInactiveFilter] = useState<'' | `${InactiveBucket}`>('');
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
  const [savingConsent, setSavingConsent] = useState(false);

  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState('');
  const [birthday, setBirthday] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);

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
      if (segmentFilter) qs.set('segment', segmentFilter);
      if (inactiveFilter) qs.set('inactiveDays', inactiveFilter);
      const res = await api<ClientListResponse>(`/api/clients?${qs.toString()}`);
      setData(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao carregar clientes.');
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, segmentFilter, inactiveFilter]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const openDetail = useCallback(async (id: string) => {
    setSelectedId(id);
    setDetailLoading(true);
    setNotesSaved(false);
    setProfileSaved(false);
    setTagDraft('');
    setError(null);
    try {
      const res = await api<ClientDetail>(`/api/clients/${id}`);
      setDetail(res);
      setNotes(res.notes || '');
      setTags(Array.isArray(res.tags) ? res.tags : []);
      setBirthday(birthdayInputValue(res.birthday));
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

  async function toggleMarketingConsent() {
    if (!selectedId || !detail) return;
    setSavingConsent(true);
    setError(null);
    try {
      const next = !detail.marketingOptIn;
      await api(`/api/clients/${selectedId}/consent`, {
        method: 'PATCH',
        body: { marketingOptIn: next },
      });
      setDetail({ ...detail, marketingOptIn: next });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível atualizar o consentimento.');
    } finally {
      setSavingConsent(false);
    }
  }

  function addTag() {
    const next = tagDraft.trim().toLowerCase();
    if (!next || tags.includes(next) || tags.length >= 20) return;
    setTags((prev) => [...prev, next.slice(0, 40)]);
    setTagDraft('');
    setProfileSaved(false);
  }

  async function saveProfile() {
    if (!selectedId || !detail) return;
    setSavingProfile(true);
    setProfileSaved(false);
    setError(null);
    try {
      const updated = await api<{ tags?: string[]; birthday?: string | null }>(
        `/api/clients/${selectedId}/profile`,
        {
          method: 'PATCH',
          body: {
            tags,
            birthday: birthday.trim() || null,
          },
        },
      );
      setDetail({
        ...detail,
        tags: updated.tags ?? tags,
        birthday: updated.birthday ?? (birthday.trim() || null),
      });
      setTags(Array.isArray(updated.tags) ? updated.tags : tags);
      setBirthday(birthdayInputValue(updated.birthday ?? birthday));
      setProfileSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível salvar o perfil.');
    } finally {
      setSavingProfile(false);
    }
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const hasActiveFilters = Boolean(debouncedSearch || segmentFilter || inactiveFilter);

  // ---- Detalhe do cliente ----
  if (selectedId) {
    return (
      <div className="animate-fade-up">
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
            <div className="mb-2 flex flex-wrap items-center gap-2">
              {detail.segment ? (
                <Badge tone={SEGMENT_TONE[detail.segment]}>{SEGMENT_LABEL[detail.segment]}</Badge>
              ) : null}
              {detail.inactiveBucket ? (
                <Badge tone="orange">{inactiveLabel(detail.inactiveBucket)}</Badge>
              ) : null}
            </div>
            <PageTitle
              title={detail.name}
              description={
                detail.segment
                  ? `Segmento ${SEGMENT_LABEL[detail.segment].toLowerCase()}. Histórico e preferências.`
                  : 'Histórico e anotações do cliente.'
              }
            />

            {detail.suggestRebooking ? (
              <div className="surface-elevated mb-4 flex flex-col gap-3 rounded-2xl p-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-ink">
                  {detail.rebooking?.message ??
                    'Cliente sem próximo horário — bom momento para remarcar.'}
                </p>
                <a
                  href={`${whatsappLink(detail.phone)}?text=${encodeURIComponent(
                    `Oi ${detail.name.split(' ')[0]}! Quer remarcar seu próximo horário?`,
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center rounded-xl bg-mint-deep px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
                >
                  Remarcar no WhatsApp
                </a>
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="surface-elevated rounded-2xl p-5 sm:col-span-2">
                <h2 className="font-display text-lg font-semibold text-ink">Contato</h2>
                <dl className="mt-3 space-y-2 text-sm">
                  <div className="flex gap-2">
                    <dt className="w-24 text-muted">WhatsApp</dt>
                    <dd className="font-medium text-ink">
                      <a
                        href={whatsappLink(detail.phone)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold text-mint-deep hover:underline"
                      >
                        {detail.phone}
                      </a>
                    </dd>
                  </div>
                  {detail.email ? (
                    <div className="flex gap-2">
                      <dt className="w-24 text-muted">E-mail</dt>
                      <dd className="font-medium text-ink">{detail.email}</dd>
                    </div>
                  ) : null}
                  <div className="flex gap-2">
                    <dt className="w-24 text-muted">Cliente desde</dt>
                    <dd className="font-medium text-ink">
                      {formatDateTime(detail.createdAt, timezone)}
                    </dd>
                  </div>
                  <div className="flex items-center gap-2">
                    <dt className="w-24 text-muted">Marketing</dt>
                    <dd className="flex flex-wrap items-center gap-2 font-medium text-ink">
                      <span>{detail.marketingOptIn ? 'Opt-in' : 'Sem opt-in'}</span>
                      <Button
                        type="button"
                        variant="secondary"
                        className="!px-2 !py-1 text-xs"
                        loading={savingConsent}
                        onClick={() => void toggleMarketingConsent()}
                      >
                        {detail.marketingOptIn ? 'Remover consentimento' : 'Registrar opt-in'}
                      </Button>
                    </dd>
                  </div>
                </dl>
              </div>
              <div className="surface-elevated rounded-2xl p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                  Pontos de fidelidade
                </p>
                <p className="mt-2 font-display text-3xl font-semibold text-ink">
                  {detail.loyaltyPoints}
                </p>
                {detail.metrics ? (
                  <dl className="mt-4 space-y-1.5 text-sm text-muted">
                    <div className="flex justify-between gap-2">
                      <dt>Visitas</dt>
                      <dd className="font-medium text-ink">{detail.metrics.completedCount}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt>Ticket médio</dt>
                      <dd className="font-medium text-ink">
                        {formatBRL(detail.metrics.avgTicketCents)}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt>Gasto total</dt>
                      <dd className="font-medium text-ink">
                        {formatBRL(detail.metrics.totalSpentCents)}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt>Visitas/mês</dt>
                      <dd className="font-medium text-ink">
                        {detail.metrics.visitsPerMonth.toLocaleString('pt-BR', {
                          maximumFractionDigits: 1,
                        })}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt>Cancel. / faltas</dt>
                      <dd className="font-medium text-ink">
                        {detail.metrics.cancelledCount} / {detail.metrics.noShowCount}
                      </dd>
                    </div>
                    {detail.metrics.lastVisit ? (
                      <div className="flex justify-between gap-2">
                        <dt>Última visita</dt>
                        <dd className="font-medium text-ink">
                          {formatDateTime(detail.metrics.lastVisit, timezone)}
                        </dd>
                      </div>
                    ) : null}
                    {detail.metrics.nextAppointmentAt ? (
                      <div className="flex justify-between gap-2">
                        <dt>Próximo</dt>
                        <dd className="font-medium text-ink">
                          {formatDateTime(detail.metrics.nextAppointmentAt, timezone)}
                        </dd>
                      </div>
                    ) : null}
                  </dl>
                ) : null}
              </div>
            </div>

            <section className="surface-elevated mt-8 rounded-2xl p-5">
              <h2 className="font-display text-lg font-semibold text-ink">Perfil CRM</h2>
              <p className="mt-1 text-sm text-muted">
                Tags e aniversário para campanhas e personalização.
              </p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field label="Aniversário" id="client-birthday" hint="Opcional · dia/mês/ano.">
                  <Input
                    id="client-birthday"
                    type="date"
                    value={birthday}
                    onChange={(e) => {
                      setBirthday(e.target.value);
                      setProfileSaved(false);
                    }}
                  />
                </Field>
                <div>
                  <Field
                    label="Tags"
                    id="client-tag-draft"
                    hint="Até 20 tags · Enter ou Adicionar."
                  >
                    <div className="flex gap-2">
                      <Input
                        id="client-tag-draft"
                        value={tagDraft}
                        maxLength={40}
                        placeholder="Ex: corte, coloração…"
                        onChange={(e) => setTagDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            addTag();
                          }
                        }}
                      />
                      <Button type="button" variant="secondary" onClick={addTag}>
                        Adicionar
                      </Button>
                    </div>
                  </Field>
                  {tags.length > 0 ? (
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {tags.map((tag) => (
                        <li key={tag}>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 rounded-md bg-paper-2 px-2 py-0.5 text-[11px] font-semibold tracking-wide text-ink-muted transition hover:bg-orange-100 hover:text-orange-950"
                            onClick={() => {
                              setTags((prev) => prev.filter((t) => t !== tag));
                              setProfileSaved(false);
                            }}
                            aria-label={`Remover tag ${tag}`}
                          >
                            {tag} ×
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-sm text-muted">Nenhuma tag ainda.</p>
                  )}
                </div>
              </div>
              <div className="mt-4 flex items-center gap-3">
                <Button type="button" onClick={() => void saveProfile()} loading={savingProfile}>
                  {savingProfile ? 'Salvando…' : 'Salvar perfil'}
                </Button>
                {profileSaved ? (
                  <span className="text-sm font-medium text-mint-deep">Perfil salvo!</span>
                ) : null}
              </div>
            </section>

            <section className="surface-elevated mt-8 rounded-2xl p-5">
              <h2 className="font-display text-lg font-semibold text-ink">Anotações</h2>
              <p className="mt-1 text-sm text-muted">
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
                <Button type="button" onClick={() => void saveNotes()} loading={savingNotes}>
                  {savingNotes ? 'Salvando…' : 'Salvar anotações'}
                </Button>
                {notesSaved ? <span className="text-sm font-medium text-mint-deep">Salvo!</span> : null}
              </div>
            </section>

            <section className="mt-8">
              <h2 className="font-display text-xl font-semibold text-ink">
                Histórico de agendamentos
              </h2>
              {detail.appointments.length === 0 ? (
                <div className="mt-4">
                  <EmptyState>Nenhum agendamento registrado.</EmptyState>
                </div>
              ) : (
                <ul className="surface-elevated mt-4 divide-y divide-paper-2 overflow-hidden rounded-2xl">
                  {detail.appointments.map((a) => (
                    <li
                      key={a.id}
                      className="flex flex-col gap-2 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5"
                    >
                      <div>
                        <p className="font-medium text-ink">{a.service?.name || 'Serviço'}</p>
                        <p className="text-sm text-muted">
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
    <div className="animate-fade-up">
      <PageTitle
        title="Clientes"
        description="Segmentação, inatividade e métricas reais da sua base."
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2">
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
        <Field
          label="Segmento"
          id="client-segment"
          hint="API filtra após métricas da página atual."
        >
          <Select
            id="client-segment"
            value={segmentFilter}
            onChange={(e) => {
              setSegmentFilter(e.target.value as '' | ClientSegment);
              setPage(1);
            }}
          >
            {SEGMENT_OPTIONS.map((opt) => (
              <option key={opt.label} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Inatividade"
          id="client-inactive"
          hint="Campanhas · respeite o opt-in."
        >
          <Select
            id="client-inactive"
            value={inactiveFilter}
            onChange={(e) => {
              setInactiveFilter(e.target.value as '' | `${InactiveBucket}`);
              setPage(1);
            }}
          >
            {INACTIVE_OPTIONS.map((opt) => (
              <option key={opt.label} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      {loading ? (
        <Spinner label="Carregando clientes…" />
      ) : !data || data.items.length === 0 ? (
        <EmptyState title={hasActiveFilters ? 'Nenhum resultado' : 'Nenhum cliente ainda'}>
          {hasActiveFilters
            ? 'Nenhum cliente nesta página com os filtros atuais. Limpe segmento/inatividade ou busque outro termo.'
            : 'Eles aparecem aqui após o primeiro agendamento.'}
        </EmptyState>
      ) : (
        <>
          <ul className="space-y-3">
            {data.items.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => void openDetail(c.id)}
                  className="surface-elevated w-full rounded-2xl p-4 text-left transition hover:border-mint-deep/40 focus-visible:ring-2 focus-visible:ring-mint-deep sm:p-5"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-ink">{c.name}</p>
                        {c.segment ? (
                          <Badge tone={SEGMENT_TONE[c.segment]}>{SEGMENT_LABEL[c.segment]}</Badge>
                        ) : null}
                        {c.inactiveBucket ? (
                          <Badge tone="orange">{inactiveLabel(c.inactiveBucket)}</Badge>
                        ) : null}
                      </div>
                      <p className="mt-0.5 text-sm text-muted">
                        {c.phone}
                        {c.email ? ` · ${c.email}` : ''}
                      </p>
                      {c.tags && c.tags.length > 0 ? (
                        <p className="mt-1.5 text-xs text-ink-muted">{c.tags.join(' · ')}</p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted">
                      <span>
                        <strong className="text-ink">{c.completedCount}</strong> visitas
                      </span>
                      <span>
                        <strong className="text-ink">{formatBRL(c.totalSpentCents)}</strong> gastos
                      </span>
                      {typeof c.avgTicketCents === 'number' ? (
                        <span>
                          ticket médio{' '}
                          <strong className="text-ink">{formatBRL(c.avgTicketCents)}</strong>
                        </span>
                      ) : null}
                      {typeof c.visitsPerMonth === 'number' ? (
                        <span>
                          <strong className="text-ink">
                            {c.visitsPerMonth.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}
                          </strong>{' '}
                          /mês
                        </span>
                      ) : null}
                      {c.noShowCount > 0 ? (
                        <span className="text-orange-700">
                          <strong>{c.noShowCount}</strong> falta{c.noShowCount > 1 ? 's' : ''}
                        </span>
                      ) : null}
                      {c.lastVisit ? (
                        <span>Última visita {formatDateTime(c.lastVisit, timezone)}</span>
                      ) : null}
                      {c.nextAppointmentAt ? (
                        <span>Próximo {formatDateTime(c.nextAppointmentAt, timezone)}</span>
                      ) : null}
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>

          <div className="mt-6 flex items-center justify-between gap-3">
            <p className="text-sm text-muted">
              {data.total} cliente{data.total === 1 ? '' : 's'}
              {segmentFilter || inactiveFilter ? ' no filtro' : ''} · página {data.page} de{' '}
              {totalPages}
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
