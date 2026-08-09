import { Reflector } from '@nestjs/core';
import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { RolesGuard } from './roles.guard';
import { ROLES_KEY } from './roles.decorator';

describe('RolesGuard — CRM / appointments RBAC', () => {
  function makeGuard(required: UserRole[] | undefined, role?: UserRole) {
    const reflector = {
      getAllAndOverride: jest.fn().mockImplementation((key: string) => {
        if (key === ROLES_KEY) return required;
        return undefined;
      }),
    };
    const guard = new RolesGuard(reflector as unknown as Reflector);
    const context = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ user: role ? { role, userId: 'u1', tenantId: 't1' } : undefined }),
      }),
    };
    return { guard, context };
  }

  it('OWNER pode mutar notes/consent (roles OWNER)', () => {
    const { guard, context } = makeGuard([UserRole.OWNER], UserRole.OWNER);
    expect(guard.canActivate(context as never)).toBe(true);
  });

  it('MEMBER é bloqueado em mutações OWNER-only (CRM writes)', () => {
    const { guard, context } = makeGuard([UserRole.OWNER], UserRole.MEMBER);
    expect(() => guard.canActivate(context as never)).toThrow(ForbiddenException);
  });

  it('MEMBER pode updateStatus quando roles incluem MEMBER', () => {
    const { guard, context } = makeGuard([UserRole.OWNER, UserRole.MEMBER], UserRole.MEMBER);
    expect(guard.canActivate(context as never)).toBe(true);
  });
});
