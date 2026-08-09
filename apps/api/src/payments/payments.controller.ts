import { Body, Controller, Logger, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppointmentStatus, PixChargeStatus } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { MercadoPagoService } from './mercadopago.service';

type MpWebhookBody = {
  type?: string;
  action?: string;
  data?: { id?: string | number };
};

@ApiTags('webhooks')
@Controller('webhooks')
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mercadoPago: MercadoPagoService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Webhook do Mercado Pago (evento "payment").
   * Sempre responde 200 — o MP reenvia em caso de erro e eventos desconhecidos
   * não devem gerar retry infinito.
   */
  @Post('mercadopago')
  @ApiOperation({ summary: 'Webhook de pagamento PIX (Mercado Pago)' })
  async mercadopago(
    @Body() body: MpWebhookBody,
    @Query('id') queryId?: string,
    @Query('topic') topic?: string,
  ) {
    const isPayment = body?.type === 'payment' || topic === 'payment';
    const paymentId = body?.data?.id ?? queryId;
    if (!isPayment || !paymentId || !this.mercadoPago.isConfigured) {
      return { ok: true };
    }

    try {
      // Não confiar no payload: buscar o pagamento direto na API do MP
      const payment = await this.mercadoPago.getPayment(String(paymentId));
      const charge = await this.prisma.pixCharge.findUnique({
        where: { providerRef: String(payment.id) },
      });
      if (!charge || charge.status === PixChargeStatus.PAID) {
        return { ok: true };
      }

      if (payment.status === 'approved') {
        await this.prisma.$transaction([
          this.prisma.pixCharge.update({
            where: { id: charge.id },
            data: { status: PixChargeStatus.PAID, paidAt: new Date() },
          }),
          this.prisma.appointment.updateMany({
            where: { id: charge.appointmentId, status: AppointmentStatus.PENDING_PAYMENT },
            data: { status: AppointmentStatus.CONFIRMED },
          }),
        ]);
        await this.notifications.enqueueBookingConfirmation(charge.appointmentId);
        this.logger.log(`PIX pago — agendamento ${charge.appointmentId} confirmado`);
      } else if (payment.status === 'cancelled' || payment.status === 'expired') {
        await this.prisma.pixCharge.update({
          where: { id: charge.id },
          data: { status: PixChargeStatus.EXPIRED },
        });
      }
    } catch (error) {
      this.logger.error(`Webhook Mercado Pago falhou: ${(error as Error).message}`);
    }

    return { ok: true };
  }
}
