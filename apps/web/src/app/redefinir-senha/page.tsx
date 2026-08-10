'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useState } from 'react';
import { AuthShell } from '@/components/AuthShell';
import { Alert, Button, Field, Input, Spinner } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { mapAuthApiFieldErrors, type AuthFieldErrors } from '@/lib/authFieldErrors';

const RESET_FIELDS = ['password', 'confirm'] as const;

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<AuthFieldErrors>({});
  const [loading, setLoading] = useState(false);

  function validateClient(): boolean {
    const next: AuthFieldErrors = {};
    if (password.length < 8) next.password = 'A senha deve ter no mínimo 8 caracteres.';
    if (!confirm) next.confirm = 'Confirme a nova senha.';
    else if (password !== confirm) next.confirm = 'As senhas não coincidem.';
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!validateClient()) return;
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
        const mapped = mapAuthApiFieldErrors(err, RESET_FIELDS);
        if (Object.keys(mapped).length > 0) {
          setFieldErrors(mapped);
          setError(null);
        } else {
          setFieldErrors({});
          setError('Token inválido ou expirado.');
        }
      } else if (err instanceof ApiError) {
        setFieldErrors({});
        setError(err.message || 'Não foi possível redefinir a senha.');
      } else {
        setFieldErrors({});
        setError('Não foi possível redefinir a senha.');
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
        <Link href="/login" className="text-sm font-semibold text-mint-deep hover:underline">
          Ir para o login
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {error ? <Alert>{error}</Alert> : null}
      <Field
        label="Nova senha"
        id="password"
        hint="Mínimo de 8 caracteres."
        error={fieldErrors.password}
      >
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            if (fieldErrors.password) setFieldErrors((f) => ({ ...f, password: '' }));
          }}
        />
      </Field>
      <Field label="Confirmar nova senha" id="confirm" error={fieldErrors.confirm}>
        <Input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={confirm}
          onChange={(e) => {
            setConfirm(e.target.value);
            if (fieldErrors.confirm) setFieldErrors((f) => ({ ...f, confirm: '' }));
          }}
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
    <AuthShell title="Redefinir senha" description="Escolha uma nova senha para acessar sua conta.">
      <Suspense fallback={<Spinner />}>
        <ResetPasswordForm />
      </Suspense>
    </AuthShell>
  );
}
