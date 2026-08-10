import { Module } from '@nestjs/common';
import { AppointmentsController } from '../appointments/appointments.controller';
import { AppointmentsService } from '../appointments/appointments.service';
import { AppointmentAvailabilityService } from './appointment-availability.service';
import { AppointmentLifecycleService } from './appointment-lifecycle.service';
import { AppointmentSideEffectsService } from './appointment-side-effects.service';
import { BookingService } from './booking.service';
import { ManageAppointmentService } from './manage-appointment.service';
import { PublicCatalogService } from './public-catalog.service';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentsModule } from '../payments/payments.module';
import { PublicController } from '../public/public.controller';
import { WaitlistModule } from '../waitlist/waitlist.module';

@Module({
  imports: [NotificationsModule, PaymentsModule, WaitlistModule, LoyaltyModule],
  controllers: [AppointmentsController, PublicController],
  providers: [
    AppointmentAvailabilityService,
    AppointmentSideEffectsService,
    AppointmentLifecycleService,
    PublicCatalogService,
    BookingService,
    ManageAppointmentService,
    AppointmentsService,
  ],
  exports: [AppointmentsService, PublicCatalogService],
})
export class AppointmentsModule {}
