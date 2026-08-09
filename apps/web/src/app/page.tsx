import Link from 'next/link';
import { BrandLogo } from '@/components/BrandLogo';
import { SiteFooter, SiteHeader } from '@/components/SiteChrome';

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col bg-atmosphere">
      <SiteHeader />
      <main className="relative flex flex-1 flex-col justify-center px-6 pb-20 pt-10 sm:px-10">
        {/* Plano visual: textura sutil + marca dominante no primeiro viewport */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-[70vh] overflow-hidden"
        >
          <div className="absolute -right-16 top-10 h-72 w-72 rounded-full bg-emerald-200/40 blur-3xl" />
          <div className="absolute bottom-0 left-[-10%] h-64 w-[55%] bg-[url('data:image/svg+xml,%3Csvg width=%2760%27 height=%2760%27 viewBox=%270 0 60 60%27 xmlns=%27http://www.w3.org/2000/svg%27%3E%3Cg fill=%27none%27 fill-rule=%27evenodd%27%3E%3Cg fill=%27%23a8a29e%27 fill-opacity=%270.18%27%3E%3Cpath d=%27M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z%27/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')] opacity-70" />
        </div>

        <div className="relative z-10 mx-auto w-full max-w-4xl">
          <BrandLogo
            href={undefined}
            size="hero"
            className="block animate-[fadeUp_0.7s_ease-out]"
          />
          <h1 className="mt-8 max-w-2xl font-display text-3xl font-medium leading-tight tracking-tight text-stone-800 text-balance animate-[fadeUp_0.8s_ease-out] sm:text-4xl">
            Sua agenda cheia, sem mensagens perdidas no WhatsApp.
          </h1>
          <p className="mt-5 max-w-xl text-lg text-stone-600 animate-[fadeUp_0.9s_ease-out]">
            Página pública de agendamento e painel profissional para barbeiros e manicures.
          </p>
          <div className="mt-10 flex flex-wrap gap-3 animate-[fadeUp_1s_ease-out]">
            <Link
              href="/register"
              className="rounded-md bg-emerald-700 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800"
            >
              Começar grátis
            </Link>
            <Link
              href="/login"
              className="rounded-md bg-white px-5 py-3 text-sm font-semibold text-stone-800 ring-1 ring-stone-300 transition hover:bg-stone-50"
            >
              Entrar
            </Link>
          </div>
        </div>
      </main>
      <SiteFooter />
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
