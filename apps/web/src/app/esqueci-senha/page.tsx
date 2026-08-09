'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { AuthShell } from '@/components/AuthShell';
import { Alert, Button, Field, Input } from '@/components/ui';
import { api, ApiError } from '@/lib/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [tenantSlug, setTenantSlug] = useState('');
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
        body: {
          email,
          ...(tenantSlug.trim() ? { tenantSlug: tenantSlug.trim().toLowerCase() } : {}),
        },
      });
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível enviar o e-mail.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Esqueci minha senha"
      description="Informe o e-mail da sua conta e enviaremos um link de redefinição."
      footer={
        <p className="text-sm text-[#6b736e]">
          Lembrou a senha?{' '}
          <Link href="/login" className="font-semibold text-teal-800 hover:underline">
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
          <Link href="/login" className="text-sm font-semibold text-teal-800 hover:underline">
            Voltar para o login
          </Link>
        </div>
      ) : (
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
          <Field
            label="Slug do negócio (opcional)"
            id="tenantSlug"
            hint="Se o mesmo e-mail existir em mais de um negócio, informe o slug (ex.: studio-maria)."
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
          <Button type="submit" fullWidth loading={loading} disabled={!email}>
            {loading ? 'Enviando…' : 'Enviar link de redefinição'}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
