'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { BrandLogo } from '@/components/BrandLogo';
import { Alert, Button, Field, Input } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { setTokens } from '@/lib/auth';
import type { LoginResponse } from '@/lib/types';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await api<LoginResponse>('/api/auth/login', {
        method: 'POST',
        auth: false,
        body: { email, password },
      });
      setTokens(data.accessToken, data.refreshToken);
      router.replace('/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível entrar.');
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
        <h1 className="font-display text-3xl font-semibold text-stone-900">Entrar</h1>
        <p className="mt-2 text-stone-600">Acesse o painel do seu negócio.</p>

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
          <Field label="Senha" id="password">
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <Button type="submit" fullWidth disabled={loading}>
            {loading ? 'Entrando…' : 'Entrar'}
          </Button>
        </form>

        <p className="mt-6 text-sm text-stone-600">
          Ainda não tem conta?{' '}
          <Link href="/register" className="font-semibold text-emerald-800 hover:underline">
            Criar conta
          </Link>
        </p>
      </main>
    </div>
  );
}
