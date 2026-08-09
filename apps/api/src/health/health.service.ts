import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  async check() {
    // SELECT 1 garante que o pool do Postgres responde (útil no Docker/CI).
    await this.prisma.$queryRaw`SELECT 1`;

    return {
      status: 'ok' as const,
      service: 'agenda-pro-api',
      timestamp: new Date().toISOString(),
      database: 'up' as const,
    };
  }
}
