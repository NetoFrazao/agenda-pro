import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { RolesGuard } from './roles.guard';
import { ROLES_KEY } from './roles.decorator';

describe('RolesGuard', () => {
  const reflector = {
    getAllAndOverride: jest.fn(),
  };
  const guard = new RolesGuard(reflector as unknown as Reflector);

  function ctx(user?: { role: string }) {
    return {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    } as never;
  }

  it('permite quando não há @Roles', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    expect(guard.canActivate(ctx({ role: UserRole.MEMBER }))).toBe(true);
  });

  it('bloqueia MEMBER em rota OWNER', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.OWNER]);
    expect(() => guard.canActivate(ctx({ role: UserRole.MEMBER }))).toThrow(ForbiddenException);
  });

  it('permite OWNER em rota OWNER', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.OWNER]);
    expect(guard.canActivate(ctx({ role: UserRole.OWNER }))).toBe(true);
  });

  it('usa a chave ROLES_KEY esperada', () => {
    expect(ROLES_KEY).toBe('roles');
  });
});
