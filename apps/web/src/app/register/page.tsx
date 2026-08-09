'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { BrandLogo } from '@/components/BrandLogo';
import { Alert, Button, Field, Input } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { setTokens } from '@/lib/auth';
import type { LoginResponse } from '@/lib/types';

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64);
}

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await api<LoginResponse>('/api/auth/register', {
        method: 'POST',
        auth: false,
        body: {
          name,
          email,
          password,
          businessName,
          slug: slug || undefined,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo',
        },
      });
      setTokens(data.accessToken, data.refreshToken);
      router.replace('/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível criar a conta.');
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
        <h1 className="font-display text-3xl font-semibold text-stone-900">Criar conta</h1>
        <p className="mt-2 text-stone-600">
          Configure seu negócio e comece a receber agendamentos.
        </p>

        <form onSubmit={onSubmit} className="mt-8 space-y-4" noValidate>
          {error ? <Alert>{error}</Alert> : null}
          <Field label="Seu nome" id="name">
            <Input
              id="name"
              name="name"
              required
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label="E-mail" id="email">
            <Input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field label="Senha" id="password" hint="Mínimo recomendado: 8 caracteres.">
            <Input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <Field label="Nome do negócio" id="businessName">
            <Input
              id="businessName"
              name="businessName"
              required
              value={businessName}
              onChange={(e) => {
                const v = e.target.value;
                setBusinessName(v);
                if (!slugTouched) setSlug(slugify(v));
              }}
            />
          </Field>
          <Field
            label="Slug da página pública"
            id="slug"
            hint={`Sua página: /u/${slug || 'seu-negocio'}`}
          >
            <Input
              id="slug"
              name="slug"
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(slugify(e.target.value));
              }}
              pattern="[a-z0-9-]{2,64}"
            />
          </Field>
          <Button type="submit" fullWidth disabled={loading}>
            {loading ? 'Criando…' : 'Criar conta'}
          </Button>
        </form>

        <p className="mt-6 text-sm text-stone-600">
          Já tem conta?{' '}
          <Link href="/login" className="font-semibold text-emerald-800 hover:underline">
            Entrar
          </Link>
        </p>
      </main>
    </div>
  );
}
