import Link from 'next/link';
import { BrandLogo } from '@/components/BrandLogo';
import { SiteFooter, SiteHeader } from '@/components/SiteChrome';

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col bg-ink-stage text-white">
      <div className="pointer-events-none absolute inset-0 mesh-grid opacity-40" aria-hidden />
      <SiteHeader tone="dark" />

      <main className="relative flex flex-1 flex-col">
        {/* Hero: one composition — brand, one line, one support, CTAs, product stage */}
        <section className="relative mx-auto grid w-full max-w-6xl flex-1 items-center gap-12 px-6 pb-16 pt-6 sm:px-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10 lg:pb-24 lg:pt-10">
          <div className="relative z-10">
            <BrandLogo href={undefined} size="hero" tone="dark" className="block animate-fade-up" />
            <h1 className="mt-8 max-w-xl font-display text-3xl font-semibold leading-[1.1] text-white text-balance animate-fade-up-delay-1 sm:text-4xl lg:text-[2.75rem]">
              Sua cadeira cheia. Sem sumiço no WhatsApp.
            </h1>
            <p className="mt-5 max-w-md text-base leading-relaxed text-white/70 animate-fade-up-delay-2 sm:text-lg">
              Link público de agendamento, lembrete automático e sinal no PIX — feito para barbeiros
              e manicures.
            </p>
            <div className="mt-10 flex flex-wrap gap-3 animate-fade-up-delay-3">
              <Link
                href="/register"
                className="rounded-2xl bg-mint px-6 py-3.5 text-sm font-semibold text-ink transition hover:bg-mint-glow"
              >
                Começar grátis
              </Link>
              <Link
                href="/planos"
                className="rounded-2xl px-6 py-3.5 text-sm font-semibold text-white/80 ring-1 ring-white/20 transition hover:bg-white/5 hover:text-white"
              >
                Ver planos
              </Link>
            </div>
          </div>

          {/* Product visual anchor */}
          <div className="relative animate-fade-up-delay-2">
            <div
              className="absolute -inset-6 rounded-[2rem] bg-gradient-to-br from-mint/20 via-transparent to-brass/15 blur-2xl"
              aria-hidden
            />
            <div className="relative animate-float overflow-hidden rounded-[1.75rem] glass-dark p-5 shadow-[0_40px_100px_-40px_rgba(0,0,0,0.8)] sm:p-6">
              <div className="mb-5 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/55">
                    Hoje
                  </p>
                  <p className="mt-1 font-display text-xl font-semibold text-white">
                    Barbearia Norte
                  </p>
                </div>
                <span className="rounded-full bg-mint/15 px-3 py-1 text-xs font-semibold text-mint-glow">
                  8 horários
                </span>
              </div>

              <div className="space-y-3">
                {[
                  { time: '09:30', name: 'João — Corte + barba', status: 'Confirmado' },
                  { time: '10:15', name: 'Marina — Manicure', status: 'Aguardando' },
                  { time: '11:00', name: 'Rafa — Degradê', status: 'Confirmado' },
                ].map((row) => (
                  <div
                    key={row.time}
                    className="flex items-center justify-between gap-3 rounded-2xl bg-white/[0.04] px-4 py-3 ring-1 ring-white/10"
                  >
                    <div>
                      <p className="font-mono text-sm text-mint-glow">{row.time}</p>
                      <p className="mt-0.5 text-sm text-white/85">{row.name}</p>
                    </div>
                    <span className="text-[11px] font-medium text-white/65">{row.status}</span>
                  </div>
                ))}
              </div>

              <div className="mt-5 rounded-2xl bg-gradient-to-r from-mint/20 via-mint/5 to-transparent p-4 ring-1 ring-mint/25">
                <p className="text-xs font-medium text-mint-glow">WhatsApp · lembrete 2h antes</p>
                <p className="mt-1 text-sm text-white/70">
                  “Oi João! Seu agendamento na Barbearia Norte é às 09:30. Confirme aqui →”
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* One job: why it wins for the niche */}
        <section className="relative border-t border-white/10 bg-[#0b0d0c]/60">
          <div className="mx-auto grid max-w-6xl gap-10 px-6 py-20 sm:px-10 md:grid-cols-3">
            {[
              {
                title: 'Link no bio',
                body: 'Cliente marca sozinho. Você para de responder “tem horário?” o dia inteiro.',
              },
              {
                title: 'Lembrete no WhatsApp',
                body: '24h e 2h antes. Menos falta, menos tempo perdido na cadeira vazia.',
              },
              {
                title: 'Sinal no PIX',
                body: 'QR e copia-e-cola no ato do agendamento. Quem reserva, aparece.',
              },
            ].map((item) => (
              <div key={item.title}>
                <h2 className="font-display text-xl font-semibold text-white">{item.title}</h2>
                <p className="mt-3 text-sm leading-relaxed text-white/65">{item.body}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <SiteFooter tone="dark" />
    </div>
  );
}
