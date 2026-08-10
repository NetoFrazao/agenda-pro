'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Button } from './ui';

const STORAGE_KEY = 'agenda_pro_onboarding_v1';

type WizardStep = 1 | 2 | 3;

interface OnboardingWizardProps {
  slug?: string | null;
  hasActiveService: boolean;
  /** Se o tenant já tem regras de disponibilidade (opcional; se omitido, passo 2 fica como CTA). */
  hasAvailability?: boolean;
}

function loadDismissed(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(STORAGE_KEY) === 'done';
}

/**
 * Wizard multi-step pós-cadastro: serviço → horários → compartilhar link.
 * Substitui o empty state único quando ainda falta ativação.
 */
export function OnboardingWizard({
  slug,
  hasActiveService,
  hasAvailability = false,
}: OnboardingWizardProps) {
  const [dismissed, setDismissed] = useState(true);
  const [step, setStep] = useState<WizardStep>(1);

  useEffect(() => {
    setDismissed(loadDismissed());
  }, []);

  useEffect(() => {
    if (!hasActiveService) setStep(1);
    else if (!hasAvailability) setStep(2);
    else setStep(3);
  }, [hasActiveService, hasAvailability]);

  if (dismissed) return null;
  if (hasActiveService && hasAvailability) {
    // Completo: não forçar wizard; usuário pode dispensar o passo de compartilhar.
  }

  const publicUrl = slug ? `/u/${slug}` : null;
  const steps: { n: WizardStep; title: string; done: boolean }[] = [
    { n: 1, title: 'Criar serviço', done: hasActiveService },
    { n: 2, title: 'Definir horários', done: hasAvailability },
    { n: 3, title: 'Compartilhar link', done: false },
  ];

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, 'done');
    setDismissed(true);
  }

  return (
    <div className="surface-elevated mb-8 overflow-hidden rounded-2xl">
      <div className="border-b border-line/80 bg-ink px-5 py-4 text-white sm:px-6">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-mint">
          Configuração inicial
        </p>
        <h2 className="mt-1 font-display text-xl font-semibold tracking-tight">
          Prepare sua agenda em 3 passos
        </h2>
        <ol className="mt-4 flex flex-wrap gap-2">
          {steps.map((s) => (
            <li key={s.n}>
              <button
                type="button"
                onClick={() => setStep(s.n)}
                className={`inline-flex min-h-9 items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                  step === s.n
                    ? 'bg-mint text-ink'
                    : s.done
                      ? 'bg-white/15 text-white'
                      : 'bg-white/5 text-white/60 hover:bg-white/10'
                }`}
                aria-current={step === s.n ? 'step' : undefined}
              >
                <span
                  className={`flex size-5 items-center justify-center rounded-md text-[10px] font-bold ${
                    step === s.n ? 'bg-ink text-mint' : 'bg-white/20'
                  }`}
                  aria-hidden
                >
                  {s.done && step !== s.n ? '✓' : s.n}
                </span>
                {s.title}
              </button>
            </li>
          ))}
        </ol>
      </div>

      <div className="px-5 py-5 sm:px-6">
        {step === 1 ? (
          <div>
            <p className="text-sm leading-relaxed text-muted">
              Sem um serviço ativo, a página pública não recebe agendamentos. Crie o primeiro com
              duração e preço.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/dashboard/services">
                <Button>{hasActiveService ? 'Gerenciar serviços' : 'Criar serviço'}</Button>
              </Link>
              {hasActiveService ? (
                <Button type="button" variant="secondary" onClick={() => setStep(2)}>
                  Próximo
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div>
            <p className="text-sm leading-relaxed text-muted">
              Defina os dias e horários em que você atende. Exceções (folgas) também ficam aqui.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/dashboard/availability">
                <Button>Configurar horários</Button>
              </Link>
              <Button type="button" variant="secondary" onClick={() => setStep(3)}>
                Já configurei · próximo
              </Button>
              <Button type="button" variant="ghost" onClick={() => setStep(1)}>
                Voltar
              </Button>
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div>
            <p className="text-sm leading-relaxed text-muted">
              Compartilhe seu link no WhatsApp ou bio do Instagram. Clientes agendam sozinhos.
            </p>
            {publicUrl ? (
              <p className="mt-3 truncate font-mono text-sm text-ink">
                {typeof window !== 'undefined' ? window.location.origin : ''}
                {publicUrl}
              </p>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2">
              {publicUrl ? (
                <Link href={publicUrl} target="_blank">
                  <Button variant="dark">Abrir página pública</Button>
                </Link>
              ) : null}
              <Button type="button" variant="secondary" onClick={dismiss}>
                Concluir
              </Button>
              <Button type="button" variant="ghost" onClick={() => setStep(2)}>
                Voltar
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
