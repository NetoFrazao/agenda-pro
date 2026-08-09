export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-6 px-6">
      <p className="text-sm font-medium tracking-wide text-emerald-800">Agenda Pro</p>
      <h1 className="text-4xl font-semibold tracking-tight text-stone-900">
        Agendamentos para barbeiros e manicures
      </h1>
      <p className="max-w-xl text-lg text-stone-600">
        Fase 1 no ar: repositório, banco multi-tenant e API base. O dashboard e a página pública
        entram nas próximas fases.
      </p>
      <a
        className="w-fit rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white"
        href="http://localhost:3001/docs"
      >
        Ver Swagger da API
      </a>
    </main>
  );
}
