'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useFocusTrap } from '@/lib/useFocusTrap';
import { AuthProvider, useAuth } from './AuthProvider';
import { BrandLogo } from './BrandLogo';
import { LogOut, Menu, X } from './icons';
import { Button } from './ui';

type NavItem = {
  href: string;
  label: string;
  exact?: boolean;
  ownerOnly?: boolean;
  group: 'main' | 'ops' | 'account';
};

const NAV_ALL: NavItem[] = [
  { href: '/dashboard', label: 'Visão geral', exact: true, group: 'main' },
  { href: '/dashboard/appointments', label: 'Agenda', group: 'main' },
  { href: '/dashboard/clients', label: 'Clientes', ownerOnly: true, group: 'main' },
  { href: '/dashboard/services', label: 'Serviços', ownerOnly: true, group: 'main' },
  { href: '/dashboard/reports', label: 'Relatórios', ownerOnly: true, group: 'main' },
  { href: '/dashboard/availability', label: 'Horários', group: 'ops' },
  { href: '/dashboard/team', label: 'Equipe', ownerOnly: true, group: 'ops' },
  { href: '/dashboard/waitlist', label: 'Espera', group: 'ops' },
  { href: '/dashboard/reviews', label: 'Avaliações', group: 'ops' },
  { href: '/dashboard/billing', label: 'Planos', ownerOnly: true, group: 'account' },
  { href: '/dashboard/settings', label: 'Ajustes', group: 'account' },
];

const GROUP_LABEL: Record<NavItem['group'], string> = {
  main: 'Principal',
  ops: 'Operação',
  account: 'Conta',
};

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
  const nav = NAV_ALL.filter((item) => !(item.ownerOnly && isMember));
  const currentLabel =
    nav.find((item) => navActive(pathname, item.href, item.exact))?.label ?? 'Dashboard';

  const groups = (['main', 'ops', 'account'] as const)
    .map((group) => ({
      group,
      label: GROUP_LABEL[group],
      items: nav.filter((item) => item.group === group),
    }))
    .filter((g) => g.items.length > 0);

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

  function renderNavLinks(onNavigate?: () => void) {
    return (
      <>
        {groups.map(({ group, label, items }) => (
          <div key={group} className="space-y-0.5">
            <p className="type-overline px-3 pb-1.5 pt-3 text-muted first:pt-0">{label}</p>
            {items.map((item) => {
              const active = navActive(pathname, item.href, item.exact);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  className={`focus-ring flex min-h-11 items-center rounded-xl px-3 py-2.5 text-[13px] font-medium transition ${
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
          </div>
        ))}
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
      </>
    );
  }

  return (
    <div className="min-h-screen bg-atmosphere">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col md:flex-row">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line/80 bg-white/90 px-5 py-3 backdrop-blur-xl md:hidden">
          <div className="min-w-0">
            <BrandLogo href="/dashboard" size="sm" />
            <p className="mt-0.5 truncate text-xs font-medium text-muted">{currentLabel}</p>
          </div>
          <button
            ref={menuButtonRef}
            type="button"
            className="focus-ring touch-target inline-flex items-center justify-center gap-2 rounded-xl px-3 text-sm font-medium text-ink-muted ring-1 ring-line"
            aria-expanded={menuOpen}
            aria-controls={navId}
            aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
            onClick={() => setMenuOpen((v) => !v)}
          >
            {menuOpen ? (
              <X className="size-5" aria-hidden strokeWidth={2} />
            ) : (
              <Menu className="size-5" aria-hidden strokeWidth={2} />
            )}
            <span>{menuOpen ? 'Fechar' : 'Menu'}</span>
          </button>
        </header>

        {menuOpen ? (
          <button
            type="button"
            className="fixed inset-0 z-40 bg-ink/40 backdrop-blur-[1px] md:hidden"
            aria-label="Fechar menu"
            onClick={() => setMenuOpen(false)}
          />
        ) : null}

        <aside
          ref={navRef}
          id={navId}
          tabIndex={-1}
          {...(!menuOpen ? { inert: true } : {})}
          className={`fixed inset-y-0 left-0 z-50 flex w-[min(18rem,88vw)] flex-col border-r border-line/80 bg-white shadow-[var(--shadow-nav)] transition-transform duration-200 ease-out md:hidden ${
            menuOpen ? 'translate-x-0' : 'pointer-events-none -translate-x-full'
          }`}
          aria-hidden={!menuOpen}
          aria-label="Menu do dashboard"
        >
          <div className="flex items-center justify-between gap-3 border-b border-line/70 px-5 py-4">
            <BrandLogo href="/dashboard" size="sm" />
            <button
              type="button"
              className="focus-ring touch-target inline-flex items-center justify-center rounded-xl text-ink-muted ring-1 ring-line"
              aria-label="Fechar menu"
              onClick={closeMenu}
            >
              <X className="size-5" aria-hidden strokeWidth={2} />
            </button>
          </div>
          <nav aria-label="Dashboard" className="flex-1 space-y-1 overflow-y-auto px-3 py-3">
            {renderNavLinks(() => setMenuOpen(false))}
          </nav>
        </aside>

        <aside className="relative z-10 hidden w-[15.5rem] shrink-0 border-r border-line/80 bg-white/80 backdrop-blur-xl md:block">
          <div className="px-5 py-5">
            <BrandLogo href="/dashboard" size="sm" />
          </div>
          <nav aria-label="Dashboard" className="space-y-1 px-3 pb-5">
            {renderNavLinks()}
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
