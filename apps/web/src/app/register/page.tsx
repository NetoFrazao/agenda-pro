'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { AuthShell } from '@/components/AuthShell';
import { Alert, Button, Field, Input } from '@/components/ui';
import { api, ApiError, ensureCsrfToken } from '@/lib/api';
import { setSessionFlag } from '@/lib/auth';
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
      await api<LoginResponse>('/api/auth/register', {
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
      // Sessão fica nos cookies httpOnly; só marcamos o flag de UX.
      setSessionFlag();
      await ensureCsrfToken();
      router.replace('/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível criar a conta.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Criar conta"
      description="Configure seu negócio e comece a receber agendamentos."
      footer={
        <p className="text-sm text-muted">
          Já tem conta?{' '}
          <Link href="/login" className="font-semibold text-mint-deep hover:underline">
            Entrar
          </Link>
        </p>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
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
        <Button type="submit" fullWidth loading={loading}>
          {loading ? 'Criando…' : 'Criar conta'}
        </Button>
      </form>
    </AuthShell>
  );
}
