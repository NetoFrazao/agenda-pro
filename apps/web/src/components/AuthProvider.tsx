'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError, clearCsrfToken, ensureCsrfToken } from '@/lib/api';
import { clearSessionFlag, setSessionFlag } from '@/lib/auth';
import type { AuthUserPayload, UserRole } from '@/lib/types';
import { Spinner } from './ui';

type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

interface AuthContextValue {
  status: AuthStatus;
  me: AuthUserPayload | null;
  role: UserRole | null;
  isOwner: boolean;
  isMember: boolean;
  timezone: string | undefined;
  refresh: () => Promise<AuthUserPayload | null>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({
  children,
  /** Se true, redireciona para /login quando a sessão falha (shell do dashboard). */
  requireAuth = false,
}: {
  children: ReactNode;
  requireAuth?: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [me, setMe] = useState<AuthUserPayload | null>(null);

  const refresh = useCallback(async (): Promise<AuthUserPayload | null> => {
    try {
      const data = await api<AuthUserPayload>('/api/auth/me');
      setMe(data);
      setSessionFlag();
      setStatus('authenticated');
      // Aquece CSRF em memória (cross-origin não lê document.cookie da API).
      void ensureCsrfToken();
      return data;
    } catch (err) {
      clearCsrfToken();
      clearSessionFlag();
      setMe(null);
      setStatus('anonymous');
      if (requireAuth) {
        router.replace('/login');
      }
      if (err instanceof ApiError && err.status === 401) return null;
      return null;
    }
  }, [requireAuth, router]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const data = await refresh();
      if (cancelled) return;
      if (!data && !requireAuth) setStatus('anonymous');
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh, requireAuth]);

  const logout = useCallback(async () => {
    try {
      await api('/api/auth/logout', { method: 'POST', body: {} }).catch(() => null);
    } finally {
      clearCsrfToken();
      clearSessionFlag();
      setMe(null);
      setStatus('anonymous');
      router.replace('/login');
    }
  }, [router]);

  const role = (me?.user?.role as UserRole | undefined) ?? null;

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      me,
      role,
      isOwner: role === 'OWNER',
      isMember: role === 'MEMBER',
      timezone: me?.tenant?.timezone,
      refresh,
      logout,
    }),
    [status, me, role, refresh, logout],
  );

  if (requireAuth && status !== 'authenticated') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-atmosphere p-6">
        <Spinner label="Verificando sessão…" />
      </div>
    );
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth deve ser usado dentro de AuthProvider');
  }
  return ctx;
}

/** Versão segura para componentes que podem renderizar fora do provider. */
export function useAuthOptional(): AuthContextValue | null {
  return useContext(AuthContext);
}
