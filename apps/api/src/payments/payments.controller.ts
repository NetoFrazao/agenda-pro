import { Body, Controller, Headers, Logger, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { MercadoPagoService } from './mercadopago.service';
import { PixLifecycleService } from './pix-lifecycle.service';
import { PrismaService } from '../prisma/prisma.service';
import { PixChargeStatus } from '@prisma/client';

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
    private readonly pixLifecycle: PixLifecycleService,
  ) {}

  /**
   * Webhook do Mercado Pago (evento "payment").
   * Sempre responde 200 — o MP reenvia em caso de erro e eventos desconhecidos
   * não devem gerar retry infinito.
   *
   * Side-effects (confirm/notify/release) são idempotentes via PixLifecycleService.
   */
  @Post('mercadopago')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({ summary: 'Webhook de pagamento PIX (Mercado Pago)' })
  async mercadopago(
    @Body() body: MpWebhookBody,
    @Headers('x-signature') xSignature: string | undefined,
    @Headers('x-request-id') xRequestId: string | undefined,
    @Query('id') queryId?: string,
    @Query('topic') topic?: string,
    @Query('data.id') dataIdQuery?: string,
  ) {
    const isPayment = body?.type === 'payment' || topic === 'payment';
    const paymentId = body?.data?.id ?? dataIdQuery ?? queryId;
    if (!isPayment || !paymentId || !this.mercadoPago.isConfigured) {
      return { ok: true };
    }

    const dataId = String(paymentId);
    if (
      !this.mercadoPago.verifyWebhookSignature({
        xSignature,
        xRequestId,
        dataId,
      })
    ) {
      this.logger.warn(`Webhook MP assinatura inválida para payment ${dataId}`);
      return { ok: true };
    }

    try {
      const payment = await this.mercadoPago.getPayment(dataId);
      const charge = await this.prisma.pixCharge.findUnique({
        where: { providerRef: String(payment.id) },
      });
      if (!charge) {
        return { ok: true };
      }

      // Fast-path: já pago — sem re-fetch side-effects (idempotência)
      if (charge.status === PixChargeStatus.PAID && payment.status === 'approved') {
        this.logger.log(
          JSON.stringify({
            event: 'pix.webhook.duplicate',
            paymentId: dataId,
            appointmentId: charge.appointmentId,
          }),
        );
        return { ok: true };
      }

      if (payment.external_reference && payment.external_reference !== charge.appointmentId) {
        this.logger.warn(
          `Webhook MP ref divergente: payment=${payment.id} ref=${payment.external_reference} expected=${charge.appointmentId}`,
        );
        return { ok: true };
      }
      if (typeof payment.transaction_amount === 'number') {
        const paidCents = Math.round(payment.transaction_amount * 100);
        if (paidCents !== charge.amountCents) {
          this.logger.warn(
            `Webhook MP valor divergente: payment=${payment.id} paid=${paidCents} expected=${charge.amountCents}`,
          );
          return { ok: true };
        }
      }

      if (payment.status === 'approved') {
        await this.pixLifecycle.confirmPaid(charge.appointmentId);
      } else if (payment.status === 'cancelled') {
        await this.pixLifecycle.releasePendingPayment(
          charge.appointmentId,
          'PIX cancelled no Mercado Pago',
          PixChargeStatus.CANCELLED,
        );
      } else if (payment.status === 'expired') {
        await this.pixLifecycle.releasePendingPayment(
          charge.appointmentId,
          'PIX expired no Mercado Pago',
          PixChargeStatus.EXPIRED,
        );
      } else if (payment.status === 'refunded' || payment.status === 'charged_back') {
        await this.pixLifecycle.markRefunded(charge.appointmentId);
      }
    } catch (error) {
      this.logger.error(`Webhook Mercado Pago falhou: ${(error as Error).message}`);
    }

    return { ok: true };
  }
}
