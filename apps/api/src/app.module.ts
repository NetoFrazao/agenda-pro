import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { APP_GUARD } from '@nestjs/core';
import { SentryModule } from '@sentry/nestjs/setup';
import { LoggerModule } from 'nestjs-pino';
import { AccountModule } from './account/account.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { AuthModule } from './auth/auth.module';
import { AvailabilityModule } from './availability/availability.module';
import { BillingModule } from './billing/billing.module';
import { ClientsModule } from './clients/clients.module';
import { CommonModule } from './common/common.module';
import { EnvModule } from './config/env.module';
import { EnvService } from './config/env.service';
import { validateEnv } from './config/env.validation';
import { HealthModule } from './health/health.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PaymentsModule } from './payments/payments.module';
import { PrismaModule } from './prisma/prisma.module';
import { ReportsModule } from './reports/reports.module';
import { ReviewsModule } from './reviews/reviews.module';
import { ServicesModule } from './services/services.module';
import { SettingsModule } from './settings/settings.module';
import { TeamModule } from './team/team.module';
import { WaitlistModule } from './waitlist/waitlist.module';

@Module({
  imports: [
    SentryModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
      validate: validateEnv,
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty', options: { singleLine: true } }
            : undefined,
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'req.body.password',
            'req.body.email',
            'req.body.phone',
            'req.body.manageToken',
            'res.body.manageToken',
          ],
          remove: true,
        },
      },
    }),
    /**
     * Rate limit compartilhado via Redis (ioredis) — contadores consistentes
     * entre réplicas. Sem Redis saudável no boot, o storage ainda aponta ao URL;
     * readiness já falha fechado se Redis estiver down.
     */
    ThrottlerModule.forRootAsync({
      imports: [EnvModule],
      inject: [EnvService],
      useFactory: (env: EnvService) => ({
        throttlers: [
          {
            name: 'default',
            ttl: 60_000,
            limit: 120,
          },
        ],
        storage: new ThrottlerStorageRedisService(env.redisUrl),
      }),
    }),
    CommonModule,
    EnvModule,
    PrismaModule,
    HealthModule,
    AuthModule,
    ServicesModule,
    AvailabilityModule,
    AppointmentsModule,
    NotificationsModule,
    BillingModule,
    AccountModule,
    PaymentsModule,
    WaitlistModule,
    SettingsModule,
    TeamModule,
    ReportsModule,
    ClientsModule,
    ReviewsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
