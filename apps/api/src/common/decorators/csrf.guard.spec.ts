import { ForbiddenException } from '@nestjs/common';
import { CsrfGuard } from './csrf.guard';
import { CSRF_COOKIE, CSRF_HEADER } from './csrf.constants';
import { ACCESS_COOKIE } from '../../auth/auth.cookies';

describe('CsrfGuard', () => {
  const guard = new CsrfGuard();

  function ctx(req: {
    method?: string;
    headers?: Record<string, string | undefined>;
    cookies?: Record<string, string | undefined>;
  }) {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          method: req.method ?? 'POST',
          headers: req.headers ?? {},
          cookies: req.cookies ?? {},
        }),
      }),
    } as never;
  }

  it('permite GET sem token', () => {
    expect(guard.canActivate(ctx({ method: 'GET', cookies: { [ACCESS_COOKIE]: 'jwt' } }))).toBe(
      true,
    );
  });

  it('permite Bearer sem CSRF', () => {
    expect(
      guard.canActivate(
        ctx({
          headers: { authorization: 'Bearer abc' },
          cookies: { [ACCESS_COOKIE]: 'jwt' },
        }),
      ),
    ).toBe(true);
  });

  it('bloqueia mutação cookie-auth sem CSRF', () => {
    expect(() => guard.canActivate(ctx({ cookies: { [ACCESS_COOKIE]: 'jwt' } }))).toThrow(
      ForbiddenException,
    );
  });

  it('permite quando header == cookie CSRF', () => {
    expect(
      guard.canActivate(
        ctx({
          cookies: { [ACCESS_COOKIE]: 'jwt', [CSRF_COOKIE]: 'tok-1' },
          headers: { [CSRF_HEADER]: 'tok-1' },
        }),
      ),
    ).toBe(true);
  });

  it('bloqueia quando header diverge do cookie', () => {
    expect(() =>
      guard.canActivate(
        ctx({
          cookies: { [ACCESS_COOKIE]: 'jwt', [CSRF_COOKIE]: 'tok-1' },
          headers: { [CSRF_HEADER]: 'other' },
        }),
      ),
    ).toThrow(ForbiddenException);
  });
});
