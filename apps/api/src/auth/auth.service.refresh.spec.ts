import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { hashToken } from '../common/crypto/tokens';

describe('AuthService.refresh — M-01 rotação atômica', () => {
  const user = {
    id: 'u1',
    tenantId: 't1',
    email: 'a@x.com',
    role: 'OWNER',
    name: 'Ana',
    isActive: true,
    deletedAt: null,
    tenant: {
      id: 't1',
      slug: 'demo',
      name: 'Demo',
      timezone: 'America/Sao_Paulo',
      plan: 'STARTER',
      deletedAt: null,
    },
  };

  function buildService(prisma: unknown, jwtSign = jest.fn().mockResolvedValue('access.jwt')) {
    return new AuthService(
      prisma as never,
      { signAsync: jwtSign } as never,
      {
        jwtAccessSecret: 'x'.repeat(32),
        jwtAccessTtl: '15m',
        jwtRefreshTtl: '7d',
      } as never,
      {} as never,
    );
  }

  it('revoga o refresh atual e cria um novo na mesma TX', async () => {
    const create = jest.fn().mockResolvedValue({});
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const findUnique = jest.fn().mockResolvedValue({
      id: 'rt1',
      tokenHash: hashToken('raw-old'),
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      userId: 'u1',
      user,
    });

    const prisma = {
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          refreshToken: { findUnique, updateMany, create },
        }),
      ),
    };

    const service = buildService(prisma);
    const result = await service.refresh('raw-old');

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'rt1', revokedAt: null },
      }),
    );
    expect(create).toHaveBeenCalled();
    expect(result.accessToken).toBe('access.jwt');
    expect(result.refreshToken).toBeTruthy();
    expect(result.refreshToken).not.toBe('raw-old');
  });

  it('reuse de refresh já revogado invalida a família e falha', async () => {
    const familyRevoke = jest.fn().mockResolvedValue({ count: 2 });
    const prisma = {
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          refreshToken: {
            findUnique: jest.fn().mockResolvedValue({
              id: 'rt1',
              revokedAt: new Date(),
              expiresAt: new Date(Date.now() + 60_000),
              userId: 'u1',
              user,
            }),
            updateMany: familyRevoke,
            create: jest.fn(),
          },
        }),
      ),
    };

    const service = buildService(prisma);
    await expect(service.refresh('stolen')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(familyRevoke).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'u1', revokedAt: null },
      }),
    );
  });
});
