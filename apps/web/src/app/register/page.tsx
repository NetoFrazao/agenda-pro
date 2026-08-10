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

const REGISTER_FIELDS = ['name', 'email', 'password', 'businessName', 'slug'] as const;

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
  const [fieldErrors, setFieldErrors] = useState<AuthFieldErrors>({});
  const [loading, setLoading] = useState(false);

  function validateClient(): boolean {
    const next: AuthFieldErrors = {};
    if (!name.trim() || name.trim().length < 2) next.name = 'Informe seu nome (mín. 2 caracteres).';
    if (!email.trim()) next.email = 'Informe o e-mail.';
    else if (!isValidEmail(email)) next.email = 'E-mail inválido.';
    if (!password) next.password = 'Informe a senha.';
    else if (password.length < 8) next.password = 'Mínimo de 8 caracteres.';
    if (!businessName.trim() || businessName.trim().length < 2) {
      next.businessName = 'Informe o nome do negócio.';
    }
    if (slug && !isValidTenantSlug(slug)) {
      next.slug = 'Use kebab-case (a-z, 0-9, hífens).';
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
      setSessionFlag();
      await ensureCsrfToken();
      router.replace('/dashboard');
    } catch (err) {
      if (err instanceof ApiError) {
        const mapped = mapAuthApiFieldErrors(err, REGISTER_FIELDS);
        if (Object.keys(mapped).length > 0) {
          setFieldErrors(mapped);
          setError(null);
        } else {
          setFieldErrors({});
          setError(err.message || 'Não foi possível criar a conta.');
        }
      } else {
        setFieldErrors({});
        setError('Não foi possível criar a conta.');
      }
    } finally {
      setLoading(false);
    }
  }

  function clearField(key: string) {
    if (fieldErrors[key]) setFieldErrors((f) => ({ ...f, [key]: '' }));
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
        <Field label="Seu nome" id="name" error={fieldErrors.name}>
          <Input
            id="name"
            name="name"
            required
            autoComplete="name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              clearField('name');
            }}
          />
        </Field>
        <Field label="E-mail" id="email" error={fieldErrors.email}>
          <Input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              clearField('email');
            }}
          />
        </Field>
        <Field
          label="Senha"
          id="password"
          hint="Mínimo recomendado: 8 caracteres."
          error={fieldErrors.password}
        >
          <Input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              clearField('password');
            }}
          />
        </Field>
        <Field label="Nome do negócio" id="businessName" error={fieldErrors.businessName}>
          <Input
            id="businessName"
            name="businessName"
            required
            value={businessName}
            onChange={(e) => {
              const v = e.target.value;
              setBusinessName(v);
              clearField('businessName');
              if (!slugTouched) setSlug(slugify(v));
            }}
          />
        </Field>
        <Field
          label="Slug da página pública"
          id="slug"
          hint={`Sua página: /u/${slug || 'seu-negocio'}`}
          error={fieldErrors.slug}
        >
          <Input
            id="slug"
            name="slug"
            value={slug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(slugify(e.target.value));
              clearField('slug');
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
