'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { api } from '@/lib/api';
import { clearTokens, getRefreshToken, hasSession } from '@/lib/auth';
import { BrandLogo } from './BrandLogo';
import { Button, Spinner } from './ui';

const NAV = [
  { href: '/dashboard', label: 'Visão geral', exact: true },
  { href: '/dashboard/services', label: 'Serviços' },
  { href: '/dashboard/availability', label: 'Disponibilidade' },
  { href: '/dashboard/appointments', label: 'Agendamentos' },
  { href: '/dashboard/billing', label: 'Planos e cobrança' },
  { href: '/dashboard/settings', label: 'Configurações' },
];

function navActive(pathname: string, href: string, exact?: boolean) {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AuthGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!hasSession()) {
      router.replace('/login');
      return;
    }
    setReady(true);
  }, [router]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-atmosphere p-6">
        <Spinner label="Verificando sessão…" />
      </div>
    );
  }

  return <>{children}</>;
}

export function DashboardShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      const refreshToken = getRefreshToken();
      if (refreshToken) {
        await api('/api/auth/logout', { method: 'POST', body: { refreshToken } }).catch(() => null);
      }
    } finally {
      clearTokens();
      router.replace('/login');
    }
  }

  return (
    <AuthGuard>
      <div className="min-h-screen bg-atmosphere">
        <div className="mx-auto flex min-h-screen max-w-6xl flex-col md:flex-row">
          <aside className="border-b border-stone-200/80 bg-white/70 backdrop-blur md:w-64 md:border-b-0 md:border-r">
            <div className="flex items-center justify-between gap-3 px-5 py-4">
              <BrandLogo href="/dashboard" size="sm" />
              <button
                type="button"
                className="rounded-md px-2 py-1 text-sm font-medium text-stone-700 ring-1 ring-stone-300 md:hidden"
                aria-expanded={menuOpen}
                aria-controls="dashboard-nav"
                onClick={() => setMenuOpen((v) => !v)}
              >
                Menu
              </button>
            </div>
            <nav
              id="dashboard-nav"
              aria-label="Dashboard"
              className={`${menuOpen ? 'block' : 'hidden'} space-y-1 px-3 pb-4 md:block`}
            >
              {NAV.map((item) => {
                const active = navActive(pathname, item.href, item.exact);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMenuOpen(false)}
                    className={`block rounded-md px-3 py-2 text-sm font-medium ${
                      active
                        ? 'bg-emerald-50 text-emerald-900'
                        : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900'
                    }`}
                    aria-current={active ? 'page' : undefined}
                  >
                    {item.label}
                  </Link>
                );
              })}
              <div className="pt-3">
                <Button
                  variant="ghost"
                  fullWidth
                  disabled={loggingOut}
                  onClick={handleLogout}
                  className="justify-start"
                >
                  {loggingOut ? 'Saindo…' : 'Sair'}
                </Button>
              </div>
            </nav>
          </aside>
          <main className="flex-1 px-5 py-8 sm:px-8">{children}</main>
        </div>
      </div>
    </AuthGuard>
  );
}
