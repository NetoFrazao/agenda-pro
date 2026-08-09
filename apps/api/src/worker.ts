import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { EnvService } from './config/env.service';

/**
 * Processo background: BullMQ Worker (notifications) + reconcile PIX.
 * Não sobe HTTP — use `main.ts` para a API.
 *
 * Local: `npm run start:worker -w @agenda-pro/api` (após build) ou
 *   `npx nest start --entryFile worker`
 * Prod: compose service `worker` com PROCESS_ROLE=worker.
 */
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    bufferLogs: true,
    logger: ['log', 'error', 'warn'],
  });
  const env = app.get(EnvService);
  const logger = new Logger('Worker');

  if (!env.runsBackgroundJobs) {
    logger.error(`PROCESS_ROLE=${env.processRole} não inicia jobs de background. Use worker|all.`);
    await app.close();
    process.exit(1);
  }

  logger.log(`Worker up (PROCESS_ROLE=${env.processRole}) — BullMQ + PIX reconcile`);

  const shutdown = async (signal: string) => {
    logger.log(`Shutdown (${signal})`);
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

void bootstrap();
