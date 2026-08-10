import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { ACCESS_COOKIE } from '../../auth/auth.cookies';
import { CSRF_COOKIE, CSRF_HEADER } from './csrf.constants';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Double-submit CSRF: exige header `X-CSRF-Token` == cookie `ap_csrf`
 * quando a sessão autenticada veio via cookie httpOnly (`ap_access`).
 * Requests com `Authorization: Bearer` (Swagger/integrações/e2e) são isentos.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const method = (req.method ?? 'GET').toUpperCase();
    if (SAFE_METHODS.has(method)) return true;

    const authHeader = req.headers.authorization;
    if (typeof authHeader === 'string' && /^Bearer\s+\S+/i.test(authHeader)) {
      return true;
    }

    const cookies = req.cookies as Record<string, string | undefined> | undefined;
    const hasAccessCookie = Boolean(cookies?.[ACCESS_COOKIE]);
    if (!hasAccessCookie) return true;

    const cookieToken = cookies?.[CSRF_COOKIE];
    const headerRaw = req.headers[CSRF_HEADER] ?? req.headers['x-csrf-token'];
    const headerToken = Array.isArray(headerRaw) ? headerRaw[0] : headerRaw;

    if (!cookieToken || !headerToken || cookieToken !== headerToken) {
      throw new ForbiddenException('CSRF token inválido ou ausente');
    }
    return true;
  }
}
