'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { BrandLogo } from '@/components/BrandLogo';
import { Alert, Button, Field, Input } from '@/components/ui';
import { api, ApiError } from '@/lib/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api('/api/auth/forgot-password', {
        method: 'POST',
        auth: false,
        body: { email },
      });
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível enviar o e-mail.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-atmosphere">
      <div className="px-6 py-6 sm:px-10">
        <BrandLogo />
      </div>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 pb-16">
        <h1 className="font-display text-3xl font-semibold text-stone-900">Esqueci minha senha</h1>
        <p className="mt-2 text-stone-600">
          Informe o e-mail da sua conta e enviaremos um link de redefinição.
        </p>

        {sent ? (
          <div className="mt-8 space-y-4">
            <Alert tone="success">
              Se o e-mail existir, enviamos um link de redefinição. Confira sua caixa de entrada e o
              spam.
            </Alert>
            <Link href="/login" className="text-sm font-semibold text-emerald-800 hover:underline">
              Voltar para o login
            </Link>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-8 space-y-4" noValidate>
            {error ? <Alert>{error}</Alert> : null}
            <Field label="E-mail" id="email">
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Button type="submit" fullWidth disabled={loading || !email}>
              {loading ? 'Enviando…' : 'Enviar link de redefinição'}
            </Button>
          </form>
        )}

        <p className="mt-6 text-sm text-stone-600">
          Lembrou a senha?{' '}
          <Link href="/login" className="font-semibold text-emerald-800 hover:underline">
            Entrar
          </Link>
        </p>
      </main>
    </div>
  );
}
