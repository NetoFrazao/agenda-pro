'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { AuthShell } from '@/components/AuthShell';
import { Alert, Button, Field, Input } from '@/components/ui';
import { api, ApiError, ensureCsrfToken } from '@/lib/api';
import { setSessionFlag } from '@/lib/auth';
import {
  isValidEmail,
  isValidTenantSlug,
  mapAuthApiFieldErrors,
  type AuthFieldErrors,
} from '@/lib/authFieldErrors';
import type { LoginResponse } from '@/lib/types';

const LOGIN_FIELDS = ['email', 'password', 'tenantSlug'] as const;

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tenantSlug, setTenantSlug] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<AuthFieldErrors>({});
  const [loading, setLoading] = useState(false);

  function validateClient(): boolean {
    const next: AuthFieldErrors = {};
    if (!email.trim()) next.email = 'Informe o e-mail.';
    else if (!isValidEmail(email)) next.email = 'E-mail inválido.';
    if (!password) next.password = 'Informe a senha.';
    else if (password.length < 8) next.password = 'Mínimo de 8 caracteres.';
    const slug = tenantSlug.trim();
    if (slug && !isValidTenantSlug(slug)) {
      next.tenantSlug = 'Use kebab-case (a-z, 0-9, hífens).';
    }
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!validateClient()) return;
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
      setSessionFlag();
      await ensureCsrfToken();
      router.replace('/dashboard');
    } catch (err) {
      if (err instanceof ApiError) {
        const mapped = mapAuthApiFieldErrors(err, LOGIN_FIELDS);
        if (Object.keys(mapped).length > 0) {
          setFieldErrors(mapped);
          setError(null);
        } else {
          setFieldErrors({});
          setError(err.message || 'Não foi possível entrar.');
        }
      } else {
        setFieldErrors({});
        setError('Não foi possível entrar.');
      }
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
        <Field label="E-mail" id="email" error={fieldErrors.email}>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (fieldErrors.email) setFieldErrors((f) => ({ ...f, email: '' }));
            }}
          />
        </Field>
        <Field label="Senha" id="password" error={fieldErrors.password}>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (fieldErrors.password) setFieldErrors((f) => ({ ...f, password: '' }));
            }}
          />
        </Field>
        <Field
          label="Slug do negócio (opcional)"
          id="tenantSlug"
          hint="Só necessário se o e-mail existir em mais de um negócio."
          error={fieldErrors.tenantSlug}
        >
          <Input
            id="tenantSlug"
            name="tenantSlug"
            autoComplete="organization"
            placeholder="studio-maria"
            value={tenantSlug}
            onChange={(e) => {
              setTenantSlug(e.target.value);
              if (fieldErrors.tenantSlug) setFieldErrors((f) => ({ ...f, tenantSlug: '' }));
            }}
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
