import { createHash, randomBytes, timingSafeEqual } from 'crypto';

export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export function generateRefreshToken(): string {
  return randomBytes(48).toString('base64url');
}

/** Token de capability URL (manage link) — mesma entropia do refresh. */
export function generateManageToken(): string {
  return randomBytes(48).toString('base64url');
}

/** SHA-256 hex (64 chars) — formato persistido em `appointments.manageToken` para tokens novos. */
export function isTokenHash(value: string): boolean {
  return /^[a-f0-9]{64}$/i.test(value);
}

/** Comparação em tempo constante para hashes hex (evita leak por timing em caminhos in-memory). */
export function safeEqualHex(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, 'hex');
    const bb = Buffer.from(b, 'hex');
    if (ba.length === 0 || ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

/** Converte TTL estilo "15m" / "7d" em milissegundos. */
export function ttlToMs(ttl: string): number {
  const match = /^(\d+)([smhd])$/.exec(ttl.trim());
  if (!match) {
    throw new Error(`TTL inválido: ${ttl}`);
  }
  const value = Number(match[1]);
  const unit = match[2];
  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };
  return value * multipliers[unit];
}
