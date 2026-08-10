'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { AuthShell } from '@/components/AuthShell';
import { Alert, Button, Field, Input } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import {
  isValidEmail,
  isValidTenantSlug,
  mapAuthApiFieldErrors,
  type AuthFieldErrors,
} from '@/lib/authFieldErrors';

const FORGOT_FIELDS = ['email', 'tenantSlug'] as const;

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [tenantSlug, setTenantSlug] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<AuthFieldErrors>({});
  const [loading, setLoading] = useState(false);

  function validateClient(): boolean {
    const next: AuthFieldErrors = {};
    if (!email.trim()) next.email = 'Informe o e-mail.';
    else if (!isValidEmail(email)) next.email = 'E-mail inválido.';
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
      await api('/api/auth/forgot-password', {
        method: 'POST',
        auth: false,
        body: {
          email,
          ...(tenantSlug.trim() ? { tenantSlug: tenantSlug.trim().toLowerCase() } : {}),
        },
      });
      setSent(true);
    } catch (err) {
      if (err instanceof ApiError) {
        const mapped = mapAuthApiFieldErrors(err, FORGOT_FIELDS);
        if (Object.keys(mapped).length > 0) {
          setFieldErrors(mapped);
          setError(null);
        } else {
          setFieldErrors({});
          setError(err.message || 'Não foi possível enviar o e-mail.');
        }
      } else {
        setFieldErrors({});
        setError('Não foi possível enviar o e-mail.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Esqueci minha senha"
      description="Informe o e-mail da sua conta e enviaremos um link de redefinição."
      footer={
        <p className="text-sm text-muted">
          Lembrou a senha?{' '}
          <Link href="/login" className="font-semibold text-mint-deep hover:underline">
            Entrar
          </Link>
        </p>
      }
    >
      {sent ? (
        <div className="space-y-4">
          <Alert tone="success">
            Se o e-mail existir, enviamos um link de redefinição. Confira sua caixa de entrada e o
            spam.
          </Alert>
          <Link href="/login" className="text-sm font-semibold text-mint-deep hover:underline">
            Voltar para o login
          </Link>
        </div>
      ) : (
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
          <Field
            label="Slug do negócio (opcional)"
            id="tenantSlug"
            hint="Se o mesmo e-mail existir em mais de um negócio, informe o slug (ex.: studio-maria)."
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
          <Button type="submit" fullWidth loading={loading} disabled={!email}>
            {loading ? 'Enviando…' : 'Enviar link de redefinição'}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
