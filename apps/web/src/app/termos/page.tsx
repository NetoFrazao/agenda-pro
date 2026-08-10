import type { Metadata } from 'next';
import { SiteFooter, SiteHeader } from '@/components/SiteChrome';

export const metadata: Metadata = {
  title: 'Termos de Uso',
};

export default function TermosPage() {
  return (
    <div className="flex min-h-screen flex-col bg-atmosphere">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12 sm:px-10">
        <h1 className="font-display text-4xl font-semibold text-ink">Termos de Uso</h1>
        <p className="mt-4 text-muted">Última atualização: agosto de 2026.</p>

        <div className="mt-8 space-y-6 text-ink-muted leading-relaxed">
          <section>
            <h2 className="font-display text-xl font-semibold text-ink">1. Aceitação</h2>
            <p className="mt-2">
              Ao criar uma conta ou usar a Agenda Pro, você concorda com estes Termos. Se não
              concordar, não utilize o serviço.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-ink">2. O serviço</h2>
            <p className="mt-2">
              A Agenda Pro oferece ferramentas de agendamento online (página pública e painel) para
              profissionais e pequenos negócios. Recursos e limites variam conforme o plano
              contratado.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-ink">
              3. Conta e responsabilidades
            </h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                Você é responsável pela veracidade dos dados cadastrais e pela guarda da senha.
              </li>
              <li>
                Você deve obter as bases legais necessárias para tratar dados dos seus clientes
                finais (ex.: consentimento ou execução de contrato de prestação de serviço).
              </li>
              <li>É proibido usar a plataforma para fins ilícitos ou abusivos.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-ink">
              4. Planos e pagamento
            </h2>
            <p className="mt-2">
              Planos pagos são cobrados conforme a oferta vigente. O não pagamento pode resultar em
              suspensão ou limitação de funcionalidades. Cancelamentos seguem as regras do painel e
              do provedor de pagamento.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-ink">
              5. Disponibilidade
            </h2>
            <p className="mt-2">
              Buscamos alta disponibilidade, mas o serviço pode sofrer interrupções por manutenção,
              falhas de terceiros ou força maior. Não garantimos disponibilidade ininterrupta.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-ink">
              6. Propriedade intelectual
            </h2>
            <p className="mt-2">
              Marca, interface e software da Agenda Pro pertencem aos seus titulares. Você mantém os
              direitos sobre o conteúdo que cadastra (serviços, textos do negócio etc.).
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-ink">
              7. Limitação de responsabilidade
            </h2>
            <p className="mt-2">
              Na máxima extensão permitida pela lei, a Agenda Pro não se responsabiliza por lucros
              cessantes, perda de dados causada por uso inadequado, ou disputas entre profissional e
              cliente final.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-ink">8. Encerramento</h2>
            <p className="mt-2">
              Você pode encerrar a conta a qualquer momento. Podemos suspender ou encerrar contas
              que violem estes Termos ou a legislação aplicável.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-ink">9. Foro</h2>
            <p className="mt-2">
              Estes Termos são regidos pelas leis brasileiras. Fica eleito o foro da comarca do
              domicílio do usuário consumidor, ou outro foro competente conforme a legislação
              vigente.
            </p>
          </section>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
