import type { Metadata } from 'next';
import { SiteFooter, SiteHeader } from '@/components/SiteChrome';

export const metadata: Metadata = {
  title: 'Privacidade',
};

export default function PrivacidadePage() {
  return (
    <div className="flex min-h-screen flex-col bg-atmosphere">
      <SiteHeader />
      <main className="prose-stone mx-auto w-full max-w-3xl flex-1 px-6 py-12 sm:px-10">
        <h1 className="font-display text-4xl font-semibold text-stone-900">
          Política de Privacidade
        </h1>
        <p className="mt-4 text-stone-600">Última atualização: agosto de 2026.</p>

        <div className="mt-8 space-y-6 text-stone-700 leading-relaxed">
          <section>
            <h2 className="font-display text-xl font-semibold text-stone-900">1. Quem somos</h2>
            <p className="mt-2">
              A Agenda Pro é uma plataforma de agendamentos para profissionais de beleza (barbeiros,
              manicures e negócios similares). Esta política descreve como tratamos dados pessoais
              em conformidade com a Lei Geral de Proteção de Dados (LGPD — Lei nº 13.709/2018).
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-stone-900">
              2. Dados que coletamos
            </h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Dados de conta do profissional: nome, e-mail, senha (hash), dados do negócio.</li>
              <li>
                Dados de clientes finais informados no agendamento público: nome, telefone e, se
                fornecido, e-mail e observações.
              </li>
              <li>
                Dados técnicos de uso: logs de acesso, IP (quando necessário para segurança/rate
                limit).
              </li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-stone-900">3. Finalidades</h2>
            <p className="mt-2">
              Usamos os dados para criar e autenticar contas, operar agendamentos, comunicar
              confirmações/lembretes, cobrar planos (quando aplicável) e cumprir obrigações legais.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-stone-900">4. Bases legais</h2>
            <p className="mt-2">
              Tratamos dados com base na execução de contrato, legítimo interesse (segurança e
              melhoria do serviço) e consentimento quando exigido (ex.: comunicações de marketing).
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-stone-900">
              5. Compartilhamento
            </h2>
            <p className="mt-2">
              Podemos compartilhar dados com provedores de infraestrutura, e-mail/WhatsApp e
              pagamento, estritamente para operar o serviço. Não vendemos dados pessoais.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-stone-900">
              6. Seus direitos (LGPD)
            </h2>
            <p className="mt-2">
              Você pode solicitar acesso, correção, portabilidade, anonimização ou exclusão dos seus
              dados. Profissionais podem excluir a conta pelo painel (Configurações). Clientes
              finais devem solicitar ao estabelecimento ou, quando aplicável, à Agenda Pro.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-stone-900">
              7. Retenção e segurança
            </h2>
            <p className="mt-2">
              Mantemos dados pelo tempo necessário às finalidades e obrigações legais. Aplicamos
              medidas técnicas e organizacionais razoáveis (HTTPS, controle de acesso, tokens
              rotativos).
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-stone-900">8. Contato</h2>
            <p className="mt-2">
              Para exercer direitos ou tirar dúvidas sobre privacidade, entre em contato pelo e-mail
              de suporte informado no produto ou no site oficial da Agenda Pro.
            </p>
          </section>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
