import * as Sentry from '@sentry/nestjs';

/**
 * Bootstrap Sentry antes de qualquer outro import de app (main/worker).
 * Sem SENTRY_DSN: no-op (dev local não quebra).
 */
const dsn = process.env.SENTRY_DSN?.trim();

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT?.trim() || process.env.NODE_ENV || 'development',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    sendDefaultPii: false,
  });
}
