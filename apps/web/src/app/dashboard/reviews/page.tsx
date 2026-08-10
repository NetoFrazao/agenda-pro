'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { Alert, Badge, Button, EmptyState, PageTitle, Spinner, Stars } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type { Review } from '@/lib/types';

export default function ReviewsPage() {
  const { timezone } = useAuth();
  const [items, setItems] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  async function load() {
    const data = await api<Review[]>('/api/reviews');
    setItems(Array.isArray(data) ? data : []);
  }

  useEffect(() => {
    void load()
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : 'Erro ao carregar avaliações.'),
      )
      .finally(() => setLoading(false));
  }, []);

  async function togglePublished(review: Review) {
    setTogglingId(review.id);
    setError(null);
    try {
      await api(`/api/reviews/${review.id}`, {
        method: 'PATCH',
        body: { isPublished: !review.isPublished },
      });
      setItems((list) =>
        list.map((r) => (r.id === review.id ? { ...r, isPublished: !r.isPublished } : r)),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível atualizar.');
    } finally {
      setTogglingId(null);
    }
  }

  if (loading) return <Spinner />;

  return (
    <div>
      <PageTitle
        title="Avaliações"
        description="Feedback dos clientes. Avaliações publicadas aparecem na sua página pública."
      />

      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      {items.length === 0 ? (
        <EmptyState>
          Nenhuma avaliação ainda. Clientes podem avaliar após um atendimento concluído.
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {items.map((r) => (
            <li key={r.id} className="surface-elevated rounded-2xl p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Stars value={r.rating} />
                    <p className="font-semibold text-ink">{r.clientName || 'Cliente'}</p>
                    <Badge tone={r.isPublished ? 'emerald' : 'stone'}>
                      {r.isPublished ? 'Publicada' : 'Oculta'}
                    </Badge>
                  </div>
                  {r.comment ? <p className="mt-2 text-sm text-ink-muted">{r.comment}</p> : null}
                  <p className="mt-2 text-sm text-muted">
                    {r.appointment?.service?.name || 'Serviço'}
                    {r.appointment?.professional?.name
                      ? ` · ${r.appointment.professional.name}`
                      : ''}
                    {r.appointment?.startsAt
                      ? ` · atendimento em ${formatDateTime(r.appointment.startsAt, timezone)}`
                      : ''}
                  </p>
                  <p className="mt-1 text-xs text-muted-soft">
                    Recebida em {formatDateTime(r.createdAt, timezone)}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={togglingId === r.id}
                  onClick={() => void togglePublished(r)}
                >
                  {togglingId === r.id ? 'Atualizando…' : r.isPublished ? 'Ocultar' : 'Publicar'}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
