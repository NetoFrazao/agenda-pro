import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Queue } from 'bullmq';
import { AppModule } from './app.module';
import { EnvService } from './config/env.service';

const NOTIFICATIONS_QUEUE = 'notifications';
const QUEUE_METRICS_INTERVAL_MS = 60_000;

/**
 * Processo background: BullMQ Worker (notifications) + reconcile PIX.
 * Não sobe HTTP — use `main.ts` para a API.
 *
 * Local: `npm run start:worker -w @agenda-pro/api` (após build) ou
 *   `npx nest start --entryFile worker`
 * Prod: compose service `worker` com PROCESS_ROLE=worker.
 *
 * Métricas: log periódico de tamanho da fila + latência p95 (últimos jobs completed).
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

  let metricsQueue: Queue | null = null;
  let metricsTimer: ReturnType<typeof setInterval> | null = null;
  try {
    metricsQueue = new Queue(NOTIFICATIONS_QUEUE, { connection: { url: env.redisUrl } });
    const logQueueMetrics = async () => {
      try {
        const counts = await metricsQueue!.getJobCounts(
          'waiting',
          'active',
          'delayed',
          'failed',
          'completed',
        );
        const completed = await metricsQueue!.getJobs(['completed'], 0, 99, false);
        const latencies = completed
          .map((job) => {
            const end = job.finishedOn;
            const start = job.timestamp;
            if (!end || !start) return null;
            return end - start;
          })
          .filter((n): n is number => typeof n === 'number' && n >= 0)
          .sort((a, b) => a - b);
        const latencyP95Ms =
          latencies.length === 0
            ? null
            : latencies[Math.min(latencies.length - 1, Math.ceil(latencies.length * 0.95) - 1)];

        logger.log(
          JSON.stringify({
            event: 'queue.metrics',
            queue: NOTIFICATIONS_QUEUE,
            waiting: counts.waiting ?? 0,
            active: counts.active ?? 0,
            delayed: counts.delayed ?? 0,
            failed: counts.failed ?? 0,
            completedSample: latencies.length,
            latencyP95Ms,
          }),
        );
      } catch (err) {
        logger.warn(`queue.metrics failed: ${(err as Error).message}`);
      }
    };
    void logQueueMetrics();
    metricsTimer = setInterval(() => void logQueueMetrics(), QUEUE_METRICS_INTERVAL_MS);
    metricsTimer.unref?.();
  } catch (err) {
    logger.warn(`Métricas de fila desabilitadas (${(err as Error).message})`);
  }

  const shutdown = async (signal: string) => {
    logger.log(`Shutdown (${signal})`);
    if (metricsTimer) clearInterval(metricsTimer);
    await metricsQueue?.close().catch(() => undefined);
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

void bootstrap();
