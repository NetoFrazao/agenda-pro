import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  /// Necessário para imagem Docker multi-stage (apps/web/Dockerfile).
  output: 'standalone',
  transpilePackages: ['@agenda-pro/shared'],
};

const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN?.trim();

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG || undefined,
  project: process.env.SENTRY_PROJECT || undefined,
  authToken: sentryAuthToken,
  silent: !process.env.CI,
  telemetry: false,
  // Sem token: build local/CI sem secrets não tenta upload (fail-soft).
  sourcemaps: {
    disable: !sentryAuthToken,
  },
  widenClientFileUpload: Boolean(sentryAuthToken),
});
