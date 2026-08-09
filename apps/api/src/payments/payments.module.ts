import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { MercadoPagoService } from './mercadopago.service';
import { PaymentsController } from './payments.controller';

@Module({
  imports: [NotificationsModule],
  controllers: [PaymentsController],
  providers: [MercadoPagoService],
  exports: [MercadoPagoService],
})
export class PaymentsModule {}
