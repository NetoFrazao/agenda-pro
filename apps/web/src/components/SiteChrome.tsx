import Link from 'next/link';
import { BrandLogo } from './BrandLogo';

export function SiteHeader() {
  return (
    <header className="relative z-10 flex items-center justify-between gap-4 px-6 py-5 sm:px-10">
      <BrandLogo size="sm" />
      <nav aria-label="Principal" className="flex items-center gap-1 sm:gap-3">
        <Link
          href="/planos"
          className="rounded-md px-3 py-2 text-sm font-medium text-stone-600 hover:text-stone-900"
        >
          Planos
        </Link>
        <Link
          href="/login"
          className="rounded-md px-3 py-2 text-sm font-medium text-stone-600 hover:text-stone-900"
        >
          Entrar
        </Link>
        <Link
          href="/register"
          className="rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-800"
        >
          Criar conta
        </Link>
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-stone-200/80 px-6 py-8 sm:px-10">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <BrandLogo size="sm" />
        <nav aria-label="Legal" className="flex flex-wrap gap-4 text-sm text-stone-500">
          <Link href="/planos" className="hover:text-stone-800">
            Planos
          </Link>
          <Link href="/privacidade" className="hover:text-stone-800">
            Privacidade
          </Link>
          <Link href="/termos" className="hover:text-stone-800">
            Termos
          </Link>
        </nav>
      </div>
    </footer>
  );
}
