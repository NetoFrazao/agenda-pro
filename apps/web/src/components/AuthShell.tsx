import type { ReactNode } from 'react';
import { BrandLogo } from './BrandLogo';

type AuthShellProps = {
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
};

export function AuthShell({ title, description, children, footer }: AuthShellProps) {
  return (
    <div className="flex min-h-screen bg-atmosphere">
      {/* Painel escuro — desktop */}
      <aside className="relative hidden w-[42%] max-w-xl flex-col justify-between overflow-hidden bg-ink-stage p-10 text-white lg:flex">
        <div className="pointer-events-none absolute inset-0 mesh-grid opacity-40" aria-hidden />
        <div className="relative z-10">
          <BrandLogo tone="dark" size="lg" />
        </div>
        <div className="relative z-10 space-y-6">
          <p className="font-display text-3xl font-semibold leading-tight text-balance">
            Sua agenda, no ritmo certo.
          </p>
          <p className="max-w-sm text-[15px] leading-relaxed text-white/70">
            Link público, lembretes automáticos e sinal no PIX — tudo em um só lugar para o seu
            negócio.
          </p>
          <ul className="space-y-3 text-sm text-white/65">
            <li className="flex items-center gap-2.5">
              <span className="size-1.5 rounded-full bg-mint" aria-hidden />
              Agendamento online 24h
            </li>
            <li className="flex items-center gap-2.5">
              <span className="size-1.5 rounded-full bg-mint" aria-hidden />
              Lembretes por WhatsApp
            </li>
            <li className="flex items-center gap-2.5">
              <span className="size-1.5 rounded-full bg-mint" aria-hidden />
              Sinal via PIX integrado
            </li>
          </ul>
        </div>
        <p className="relative z-10 text-xs text-white/55">© Agenda Pro</p>
      </aside>

      {/* Formulário */}
      <main className="flex flex-1 flex-col">
        <div className="px-6 py-6 lg:hidden">
          <BrandLogo />
        </div>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-10 lg:px-12 lg:py-16">
          <div className="surface-elevated animate-fade-up rounded-2xl p-7 sm:p-8">
            <h1 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              {title}
            </h1>
            <p className="mt-2 text-[15px] leading-relaxed text-muted">{description}</p>
            <div className="mt-7">{children}</div>
          </div>
          {footer ? <div className="mt-6 text-center">{footer}</div> : null}
        </div>
      </main>
    </div>
  );
}
