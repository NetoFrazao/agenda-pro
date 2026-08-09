import { HealthService } from './health.service';

describe('HealthService', () => {
  const env = { redisUrl: 'redis://localhost:6379' };

  it('retorna status ok quando o banco responde', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    };

    const service = new HealthService(prisma as never, env as never);
    jest.spyOn(service as never, 'pingRedis').mockResolvedValue('up' as never);

    const result = await service.check();

    expect(result.status).toBe('ok');
    expect(result.database).toBe('up');
    expect(result.redis).toBe('up');
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('ready=false quando Postgres está down', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockRejectedValue(new Error('db down')),
    };

    const service = new HealthService(prisma as never, env as never);
    jest.spyOn(service as never, 'pingRedis').mockResolvedValue('up' as never);

    const result = await service.ready();

    expect(result.ready).toBe(false);
    expect(result.database).toBe('down');
    expect(result.status).toBe('degraded');
  });

  it('ready=false quando Redis está down', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    };

    const service = new HealthService(prisma as never, env as never);
    jest.spyOn(service as never, 'pingRedis').mockResolvedValue('down' as never);

    const result = await service.ready();

    expect(result.ready).toBe(false);
    expect(result.redis).toBe('down');
  });
});
