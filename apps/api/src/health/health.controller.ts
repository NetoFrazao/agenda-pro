import { Controller, Get, Res } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { HealthService } from './health.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  @ApiOperation({ summary: 'Liveness — API + Postgres (+ status Redis informativo)' })
  @ApiOkResponse({ description: 'Serviço saudável' })
  check() {
    return this.health.check();
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness — Postgres e Redis obrigatórios' })
  @ApiOkResponse({ description: 'Pronto para receber tráfego' })
  @ApiServiceUnavailableResponse({ description: 'Dependência crítica indisponível' })
  async ready(@Res({ passthrough: true }) res: Response) {
    const result = await this.health.ready();
    if (!result.ready) {
      res.status(503);
    }
    return result;
  }
}
