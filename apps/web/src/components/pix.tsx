'use client';

import Image from 'next/image';
import { useState } from 'react';
import { formatBRL, formatDateTime } from '@/lib/format';
import { Button } from './ui';

export function CopyButton({ value, label = 'Copiar' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard indisponível (http/permissão): mantém o texto selecionável na tela
    }
  }

  return (
    <Button type="button" variant="secondary" onClick={() => void copy()} aria-live="polite">
      {copied ? 'Copiado!' : label}
    </Button>
  );
}

type PixBlockProps = {
  amountCents: number;
  copyPaste: string;
  qrCodeBase64?: string | null;
  expiresAt?: string | null;
  timezone?: string;
  note?: string;
};

/** Bloco de pagamento do sinal via PIX (QR + copia-e-cola). */
export function PixBlock({
  amountCents,
  copyPaste,
  qrCodeBase64,
  expiresAt,
  timezone,
  note,
}: PixBlockProps) {
  return (
    <section
      aria-label="Pagamento do sinal via PIX"
      className="rounded-lg border border-amber-200 bg-amber-50 p-5"
    >
      <h2 className="font-display text-lg font-semibold text-amber-950">
        Sinal via PIX — {formatBRL(amountCents)}
      </h2>
      {note ? <p className="mt-1 text-sm text-amber-900/90">{note}</p> : null}

      <div className="mt-4 flex flex-col items-start gap-4 sm:flex-row">
        {qrCodeBase64 ? (
          <Image
            src={`data:image/png;base64,${qrCodeBase64}`}
            alt="QR Code PIX para pagamento do sinal"
            width={176}
            height={176}
            unoptimized
            className="size-44 rounded-md bg-white p-2 ring-1 ring-amber-200"
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-amber-950">PIX copia-e-cola</p>
          <p className="mt-1 max-h-24 overflow-y-auto break-all rounded-md bg-white p-2 font-mono text-xs text-ink-muted ring-1 ring-amber-200">
            {copyPaste}
          </p>
          <div className="mt-3">
            <CopyButton value={copyPaste} label="Copiar código PIX" />
          </div>
        </div>
      </div>

      {expiresAt ? (
        <p className="mt-4 text-sm font-medium text-amber-900">
          Atenção: este PIX expira em {formatDateTime(expiresAt, timezone)}.
        </p>
      ) : null}
    </section>
  );
}
