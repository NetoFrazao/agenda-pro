'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Alert, Button, Field, Input, PageTitle, Spinner } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { clearTokens } from '@/lib/auth';
import type { AuthUserPayload } from '@/lib/types';

export default function SettingsPage() {
  const router = useRouter();
  const [me, setMe] = useState<AuthUserPayload | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api<AuthUserPayload>('/api/auth/me')
      .then(setMe)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Erro ao carregar conta.'))
      .finally(() => setLoading(false));
  }, []);

  async function deleteAccount() {
    if (confirmText !== 'EXCLUIR') {
      setError('Digite EXCLUIR para confirmar.');
      return;
    }
    if (
      !confirm(
        'Esta ação apaga sua conta e dados pessoais (LGPD). Não pode ser desfeita. Continuar?',
      )
    ) {
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      await api('/api/account', { method: 'DELETE' });
      clearTokens();
      router.replace('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível excluir a conta.');
      setDeleting(false);
    }
  }

  if (loading) return <Spinner />;

  return (
    <div>
      <PageTitle title="Configurações" description="Dados da conta e exclusão definitiva (LGPD)." />
      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      <section className="mb-10 rounded-lg bg-white/80 p-5 ring-1 ring-stone-200">
        <h2 className="font-display text-lg font-semibold text-stone-900">Conta</h2>
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex gap-2">
            <dt className="w-28 text-stone-500">Nome</dt>
            <dd className="font-medium text-stone-900">{me?.user?.name}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-28 text-stone-500">E-mail</dt>
            <dd className="font-medium text-stone-900">{me?.user?.email}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-28 text-stone-500">Negócio</dt>
            <dd className="font-medium text-stone-900">{me?.tenant?.name}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-28 text-stone-500">Slug</dt>
            <dd className="font-medium text-stone-900">/u/{me?.tenant?.slug}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-28 text-stone-500">Fuso</dt>
            <dd className="font-medium text-stone-900">{me?.tenant?.timezone}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-lg border border-red-200 bg-red-50/60 p-5">
        <h2 className="font-display text-lg font-semibold text-red-900">Excluir conta (LGPD)</h2>
        <p className="mt-2 max-w-xl text-sm text-red-900/80">
          Remove permanentemente sua conta, dados do negócio e informações pessoais tratadas pela
          Agenda Pro. Agendamentos e histórico vinculados serão apagados conforme a política de
          retenção.
        </p>
        <div className="mt-4 max-w-sm">
          <Field label="Digite EXCLUIR para confirmar" id="confirm-delete">
            <Input
              id="confirm-delete"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              autoComplete="off"
            />
          </Field>
        </div>
        <Button
          type="button"
          variant="danger"
          className="mt-4"
          disabled={deleting || confirmText !== 'EXCLUIR'}
          onClick={() => void deleteAccount()}
        >
          {deleting ? 'Excluindo…' : 'Excluir minha conta'}
        </Button>
      </section>
    </div>
  );
}
