import { Module } from '@nestjs/common';
import { AppointmentsController } from '../appointments/appointments.controller';
import { AppointmentsService } from '../appointments/appointments.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentsModule } from '../payments/payments.module';
import { PublicController } from '../public/public.controller';
import { WaitlistModule } from '../waitlist/waitlist.module';

@Module({
  imports: [NotificationsModule, PaymentsModule, WaitlistModule],
  controllers: [AppointmentsController, PublicController],
  providers: [AppointmentsService],
  exports: [AppointmentsService],
})
export class AppointmentsModule {}
