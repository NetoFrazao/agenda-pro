import { generateManageToken, hashToken, isTokenHash, ttlToMs } from './tokens';

describe('tokens helpers', () => {
  it('ttlToMs converte unidades', () => {
    expect(ttlToMs('15m')).toBe(15 * 60_000);
    expect(ttlToMs('7d')).toBe(7 * 86_400_000);
  });

  it('hashToken é determinístico (SHA-256)', () => {
    expect(hashToken('abc')).toBe(hashToken('abc'));
    expect(hashToken('abc')).not.toBe(hashToken('abcd'));
  });

  it('generateManageToken tem alta entropia e hash de 64 hex', () => {
    const a = generateManageToken();
    const b = generateManageToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(60);
    expect(isTokenHash(hashToken(a))).toBe(true);
    expect(isTokenHash(a)).toBe(false);
  });
});
