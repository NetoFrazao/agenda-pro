import { Injectable, Logger } from '@nestjs/common';
import { EnvService } from '../config/env.service';

export type PixChargeResult = {
  providerRef: string;
  copyPaste: string | null;
  qrCodeBase64: string | null;
  ticketUrl: string | null;
  expiresAt: Date | null;
};

export type MercadoPagoPayment = {
  id: number;
  status: string;
  external_reference?: string;
};

const MP_API = 'https://api.mercadopago.com';

/**
 * Cobrança PIX de sinal via Mercado Pago (Payments API).
 * Sem MERCADOPAGO_ACCESS_TOKEN o booking segue sem cobrança online
 * (sinal vira combinado "pagar no local").
 */
@Injectable()
export class MercadoPagoService {
  private readonly logger = new Logger(MercadoPagoService.name);

  constructor(private readonly env: EnvService) {}

  get isConfigured(): boolean {
    return Boolean(this.env.mercadoPagoAccessToken);
  }

  async createPixCharge(input: {
    amountCents: number;
    description: string;
    payerEmail: string | null;
    payerName: string;
    /** appointmentId — volta no webhook como external_reference */
    externalReference: string;
    expiresInMinutes?: number;
  }): Promise<PixChargeResult> {
    const expiresAt = new Date(Date.now() + (input.expiresInMinutes ?? 30) * 60_000);
    const [firstName, ...rest] = input.payerName.trim().split(/\s+/);

    const response = await fetch(`${MP_API}/v1/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.env.mercadoPagoAccessToken}`,
        // Idempotência: retries do mesmo booking não geram cobrança duplicada
        'X-Idempotency-Key': input.externalReference,
      },
      body: JSON.stringify({
        transaction_amount: Number((input.amountCents / 100).toFixed(2)),
        description: input.description,
        payment_method_id: 'pix',
        external_reference: input.externalReference,
        date_of_expiration: expiresAt.toISOString().replace('Z', '-00:00'),
        payer: {
          email: input.payerEmail || 'cliente@agendapro.app',
          first_name: firstName,
          last_name: rest.join(' ') || undefined,
        },
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Mercado Pago ${response.status}: ${body.slice(0, 500)}`);
    }

    const payment = (await response.json()) as {
      id: number;
      point_of_interaction?: {
        transaction_data?: { qr_code?: string; qr_code_base64?: string; ticket_url?: string };
      };
    };
    const tx = payment.point_of_interaction?.transaction_data;

    this.logger.log(`PIX criado no Mercado Pago: payment ${payment.id}`);
    return {
      providerRef: String(payment.id),
      copyPaste: tx?.qr_code ?? null,
      qrCodeBase64: tx?.qr_code_base64 ?? null,
      ticketUrl: tx?.ticket_url ?? null,
      expiresAt,
    };
  }

  async getPayment(paymentId: string): Promise<MercadoPagoPayment> {
    const response = await fetch(`${MP_API}/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${this.env.mercadoPagoAccessToken}` },
    });
    if (!response.ok) {
      throw new Error(`Mercado Pago getPayment ${response.status}`);
    }
    return (await response.json()) as MercadoPagoPayment;
  }
}
