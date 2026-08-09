import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { EnvService } from './config/env.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const logger = app.get(Logger);
  app.useLogger(logger);

  const env = app.get(EnvService);

  app.use(helmet());
  app.enableCors({
    origin: env.corsOrigin,
    credentials: true,
  });
  app.setGlobalPrefix('api');

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Agenda Pro API')
    .setDescription(
      'API do Mini-SaaS de agendamentos para barbeiros e manicures. Multi-tenant, UTC no banco, JWT no dashboard.',
    )
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  await app.listen(env.apiPort, env.apiHost);
  logger.log(`API listening on http://${env.apiHost}:${env.apiPort}`);
  logger.log(`Swagger em http://localhost:${env.apiPort}/docs`);
}

void bootstrap();
