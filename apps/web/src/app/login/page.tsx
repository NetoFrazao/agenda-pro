'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { AuthShell } from '@/components/AuthShell';
import { Alert, Button, Field, Input } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { setSessionFlag } from '@/lib/auth';
import type { LoginResponse } from '@/lib/types';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tenantSlug, setTenantSlug] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api<LoginResponse>('/api/auth/login', {
        method: 'POST',
        auth: false,
        body: {
          email,
          password,
          ...(tenantSlug.trim() ? { tenantSlug: tenantSlug.trim().toLowerCase() } : {}),
        },
      });
      // Sessão fica nos cookies httpOnly; só marcamos o flag de UX.
      setSessionFlag();
      router.replace('/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível entrar.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Entrar"
      description="Acesse o painel do seu negócio."
      footer={
        <p className="text-sm text-muted">
          Ainda não tem conta?{' '}
          <Link href="/register" className="font-semibold text-mint-deep hover:underline">
            Criar conta
          </Link>
        </p>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
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
        <Field
          label="Slug do negócio (opcional)"
          id="tenantSlug"
          hint="Só necessário se o e-mail existir em mais de um negócio."
        >
          <Input
            id="tenantSlug"
            name="tenantSlug"
            autoComplete="organization"
            placeholder="studio-maria"
            value={tenantSlug}
            onChange={(e) => setTenantSlug(e.target.value)}
          />
        </Field>
        <div className="text-right">
          <Link href="/esqueci-senha" className="text-sm font-medium text-mint-deep hover:underline">
            Esqueci minha senha
          </Link>
        </div>
        <Button type="submit" fullWidth loading={loading}>
          {loading ? 'Entrando…' : 'Entrar'}
        </Button>
      </form>
    </AuthShell>
  );
}
