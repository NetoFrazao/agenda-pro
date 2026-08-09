import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { EnvService } from './config/env.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    rawBody: true,
  });
  const logger = app.get(Logger);
  app.useLogger(logger);

  const env = app.get(EnvService);

  if (!env.runsHttp) {
    throw new Error(
      `PROCESS_ROLE=${env.processRole} não sobe HTTP. Use entrypoint worker.ts (PROCESS_ROLE=worker|all).`,
    );
  }

  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: env.corsOrigin,
    credentials: true,
  });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());

  // Swagger desligado em produção por padrão (SWAGGER_ENABLED=true para expor)
  if (env.swaggerEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Agenda Pro API')
      .setDescription(
        'API do Mini-SaaS de agendamentos para barbeiros e manicures. Multi-tenant, UTC no banco, JWT no dashboard.',
      )
      .setVersion('0.2.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document);
  }

  await app.listen(env.apiPort, env.apiHost);
  logger.log(`API listening on http://${env.apiHost}:${env.apiPort}`);
  if (env.swaggerEnabled) {
    logger.log(`Swagger em http://localhost:${env.apiPort}/docs`);
  }
}

void bootstrap();
