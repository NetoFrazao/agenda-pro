import { EnvService } from '../config/env.service';

describe('AuthService helpers contract', () => {
  it('EnvService expõe segredos JWT (smoke de wiring)', () => {
    const config = {
      get: (key: string) => {
        const map: Record<string, string> = {
          JWT_ACCESS_SECRET: 'x'.repeat(32),
          JWT_REFRESH_SECRET: 'y'.repeat(32),
          JWT_ACCESS_TTL: '15m',
          JWT_REFRESH_TTL: '7d',
        };
        return map[key];
      },
    };
    const env = new EnvService(config as never);
    expect(env.jwtAccessSecret.length).toBeGreaterThanOrEqual(32);
  });
});
