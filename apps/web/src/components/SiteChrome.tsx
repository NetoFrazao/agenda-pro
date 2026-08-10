import Link from 'next/link';
import { BrandLogo } from './BrandLogo';

export function SiteHeader({ tone = 'light' }: { tone?: 'light' | 'dark' }) {
  const link = tone === 'dark' ? 'text-white/70 hover:text-white' : 'text-ink-muted hover:text-ink';
  const cta =
    tone === 'dark'
      ? 'bg-mint text-ink hover:bg-mint-glow'
      : 'bg-ink text-white hover:bg-ink-soft';

  return (
    <header className="relative z-20 flex items-center justify-between gap-4 px-6 py-5 sm:px-10">
      <BrandLogo size="sm" tone={tone} />
      <nav aria-label="Principal" className="flex items-center gap-1 sm:gap-2">
        <Link href="/planos" className={`focus-ring rounded-xl px-3 py-2.5 text-sm font-medium ${link}`}>
          Planos
        </Link>
        <Link href="/login" className={`focus-ring rounded-xl px-3 py-2.5 text-sm font-medium ${link}`}>
          Entrar
        </Link>
        <Link
          href="/register"
          className={`focus-ring rounded-xl px-3.5 py-2.5 text-sm font-semibold transition ${cta}`}
        >
          Criar conta
        </Link>
      </nav>
    </header>
  );
}

export function SiteFooter({ tone = 'light' }: { tone?: 'light' | 'dark' }) {
  const border = tone === 'dark' ? 'border-white/10' : 'border-line/80';
  const link = tone === 'dark' ? 'text-white/65 hover:text-white' : 'text-muted hover:text-ink';

  return (
    <footer className={`mt-auto border-t ${border} px-6 py-10 sm:px-10`}>
      <div className="mx-auto flex max-w-6xl flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <BrandLogo size="sm" tone={tone} />
          <p
            className={`mt-2 max-w-sm text-sm ${tone === 'dark' ? 'text-white/65' : 'text-muted'}`}
          >
            Agenda inteligente para barbeiros e manicures que vivem no WhatsApp.
          </p>
        </div>
        <nav aria-label="Legal" className="flex flex-wrap gap-5 text-sm">
          <Link href="/planos" className={link}>
            Planos
          </Link>
          <Link href="/privacidade" className={link}>
            Privacidade
          </Link>
          <Link href="/termos" className={link}>
            Termos
          </Link>
        </nav>
      </div>
    </footer>
  );
}
