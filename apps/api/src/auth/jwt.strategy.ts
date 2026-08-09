import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { EnvService } from '../config/env.service';
import { AuthUser } from '../common/decorators/current-user.decorator';

type JwtPayload = {
  sub: string;
  tenantId: string;
  email: string;
  role: string;
};

/** Aceita Bearer token (Swagger/integrações) OU cookie httpOnly (frontend web). */
function cookieExtractor(req: Request): string | null {
  return (req?.cookies?.ap_access as string | undefined) ?? null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(env: EnvService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        cookieExtractor,
      ]),
      ignoreExpiration: false,
      secretOrKey: env.jwtAccessSecret,
    });
  }

  validate(payload: JwtPayload): AuthUser {
    return {
      userId: payload.sub,
      tenantId: payload.tenantId,
      email: payload.email,
      role: payload.role,
    };
  }
}
