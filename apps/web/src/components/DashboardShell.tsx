'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useFocusTrap } from '@/lib/useFocusTrap';
import { AuthProvider, useAuth } from './AuthProvider';
import { BrandLogo } from './BrandLogo';
import { LogOut, Menu, X } from './icons';
import { Button } from './ui';

const NAV_ALL = [
  { href: '/dashboard', label: 'Visão geral', exact: true },
  { href: '/dashboard/appointments', label: 'Agenda' },
  { href: '/dashboard/clients', label: 'Clientes', ownerOnly: true },
  { href: '/dashboard/services', label: 'Serviços', ownerOnly: true },
  { href: '/dashboard/availability', label: 'Horários' },
  { href: '/dashboard/team', label: 'Equipe', ownerOnly: true },
  { href: '/dashboard/reports', label: 'Relatórios', ownerOnly: true },
  { href: '/dashboard/waitlist', label: 'Espera' },
  { href: '/dashboard/reviews', label: 'Avaliações' },
  { href: '/dashboard/billing', label: 'Planos', ownerOnly: true },
  { href: '/dashboard/settings', label: 'Ajustes' },
] as const;

function navActive(pathname: string, href: string, exact?: boolean) {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function DashboardChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { logout, isMember } = useAuth();
  const navId = useId();
  const navRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  // MEMBER (RBAC fino): CRM completo é do OWNER — esconde itens ownerOnly no nav.
  const nav = NAV_ALL.filter((item) => !('ownerOnly' in item && item.ownerOnly && isMember));

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    menuButtonRef.current?.focus();
  }, []);

  useFocusTrap(navRef, {
    enabled: menuOpen,
    onEscape: closeMenu,
    restoreFocus: false,
    mobileOnly: true,
  });

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <div className="min-h-screen bg-atmosphere">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col md:flex-row">
        {menuOpen ? (
          <button
            type="button"
            className="fixed inset-0 z-40 bg-ink/40 backdrop-blur-[1px] md:hidden"
            aria-label="Fechar menu"
            onClick={() => setMenuOpen(false)}
          />
        ) : null}

        <aside
          className={`relative z-40 border-b border-line/80 bg-white/80 backdrop-blur-xl md:z-10 md:w-[15.5rem] md:shrink-0 md:border-b-0 md:border-r ${
            menuOpen ? 'shadow-[var(--shadow-nav)]' : ''
          }`}
        >
          <div className="flex items-center justify-between gap-3 px-5 py-4 md:py-5">
            <BrandLogo href="/dashboard" size="sm" />
            <button
              ref={menuButtonRef}
              type="button"
              className="touch-target inline-flex items-center justify-center gap-2 rounded-xl px-3 text-sm font-medium text-ink-muted ring-1 ring-line md:hidden"
              aria-expanded={menuOpen}
              aria-controls={navId}
              onClick={() => setMenuOpen((v) => !v)}
            >
              {menuOpen ? (
                <X className="size-5" aria-hidden strokeWidth={2} />
              ) : (
                <Menu className="size-5" aria-hidden strokeWidth={2} />
              )}
              <span>{menuOpen ? 'Fechar' : 'Menu'}</span>
            </button>
          </div>
          <nav
            ref={navRef}
            id={navId}
            aria-label="Dashboard"
            className={`${menuOpen ? 'block' : 'hidden'} max-h-[min(70vh,28rem)] space-y-0.5 overflow-y-auto px-3 pb-5 md:block md:max-h-none`}
          >
            {nav.map((item) => {
              const active = navActive(pathname, item.href, 'exact' in item ? item.exact : false);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  className={`flex min-h-11 items-center rounded-xl px-3 py-2.5 text-[13px] font-medium transition ${
                    active
                      ? 'bg-ink text-white shadow-sm'
                      : 'text-ink-muted hover:bg-black/[0.035] hover:text-ink'
                  }`}
                  aria-current={active ? 'page' : undefined}
                >
                  {item.label}
                </Link>
              );
            })}
            <div className="border-t border-line/70 pt-4">
              <Button
                variant="ghost"
                fullWidth
                loading={loggingOut}
                onClick={handleLogout}
                className="justify-start text-muted"
              >
                {!loggingOut ? <LogOut className="size-4" aria-hidden strokeWidth={2} /> : null}
                {loggingOut ? 'Saindo…' : 'Sair'}
              </Button>
            </div>
          </nav>
        </aside>
        <main className="flex-1 px-5 py-8 sm:px-8 lg:px-10">{children}</main>
      </div>
    </div>
  );
}

/** Compat: AuthGuard agora é AuthProvider com requireAuth. */
export function AuthGuard({ children }: { children: ReactNode }) {
  return <AuthProvider requireAuth>{children}</AuthProvider>;
}

export function DashboardShell({ children }: { children: ReactNode }) {
  return (
    <AuthProvider requireAuth>
      <DashboardChrome>{children}</DashboardChrome>
    </AuthProvider>
  );
}
