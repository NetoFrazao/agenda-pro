import { Module } from '@nestjs/common';
import { AppointmentsController } from '../appointments/appointments.controller';
import { AppointmentsService } from '../appointments/appointments.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { PublicController } from '../public/public.controller';

@Module({
  imports: [NotificationsModule],
  controllers: [AppointmentsController, PublicController],
  providers: [AppointmentsService],
  exports: [AppointmentsService],
})
export class AppointmentsModule {}
