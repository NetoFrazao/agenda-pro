import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { MercadoPagoService } from './mercadopago.service';
import { PaymentsController } from './payments.controller';
import { PixLifecycleService } from './pix-lifecycle.service';

@Module({
  imports: [NotificationsModule],
  controllers: [PaymentsController],
  providers: [MercadoPagoService, PixLifecycleService],
  exports: [MercadoPagoService, PixLifecycleService],
})
export class PaymentsModule {}
