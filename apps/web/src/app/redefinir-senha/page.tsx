'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useState } from 'react';
import { BrandLogo } from '@/components/BrandLogo';
import { Alert, Button, Field, Input, Spinner } from '@/components/ui';
import { api, ApiError } from '@/lib/api';

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError('A senha deve ter no mínimo 8 caracteres.');
      return;
    }
    if (password !== confirm) {
      setError('As senhas não coincidem.');
      return;
    }
    setLoading(true);
    try {
      await api('/api/auth/reset-password', {
        method: 'POST',
        auth: false,
        body: { token, password },
      });
      setDone(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        setError('Token inválido ou expirado.');
      } else {
        setError(err instanceof ApiError ? err.message : 'Não foi possível redefinir a senha.');
      }
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="space-y-4">
        <Alert>
          Link de redefinição inválido. Solicite um novo em{' '}
          <Link href="/esqueci-senha" className="font-semibold underline">
            esqueci minha senha
          </Link>
          .
        </Alert>
      </div>
    );
  }

  if (done) {
    return (
      <div className="space-y-4">
        <Alert tone="success">Senha redefinida com sucesso.</Alert>
        <Link href="/login" className="text-sm font-semibold text-emerald-800 hover:underline">
          Ir para o login
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {error ? <Alert>{error}</Alert> : null}
      <Field label="Nova senha" id="password" hint="Mínimo de 8 caracteres.">
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>
      <Field label="Confirmar nova senha" id="confirm">
        <Input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </Field>
      <Button type="submit" fullWidth disabled={loading}>
        {loading ? 'Redefinindo…' : 'Redefinir senha'}
      </Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="flex min-h-screen flex-col bg-atmosphere">
      <div className="px-6 py-6 sm:px-10">
        <BrandLogo />
      </div>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 pb-16">
        <h1 className="font-display text-3xl font-semibold text-stone-900">Redefinir senha</h1>
        <p className="mt-2 text-stone-600">Escolha uma nova senha para acessar sua conta.</p>
        <div className="mt-8">
          <Suspense fallback={<Spinner />}>
            <ResetPasswordForm />
          </Suspense>
        </div>
      </main>
    </div>
  );
}
