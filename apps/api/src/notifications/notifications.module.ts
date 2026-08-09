import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { WhatsAppProvider } from './whatsapp.provider';

@Module({
  providers: [NotificationsService, WhatsAppProvider],
  exports: [NotificationsService, WhatsAppProvider],
})
export class NotificationsModule {}
