'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="pt-BR">
      <body>
        <main style={{ fontFamily: 'system-ui', padding: '2rem', maxWidth: 480 }}>
          <h1>Algo deu errado</h1>
          <p>Tente novamente. Se o problema continuar, volte mais tarde.</p>
          <button type="button" onClick={() => reset()}>
            Tentar de novo
          </button>
        </main>
      </body>
    </html>
  );
}
