import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  /// Necessário para imagem Docker multi-stage (apps/web/Dockerfile).
  output: 'standalone',
};

export default nextConfig;
