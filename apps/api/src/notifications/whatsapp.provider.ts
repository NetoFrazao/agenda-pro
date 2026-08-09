import { Injectable, Logger } from '@nestjs/common';
import { EnvService } from '../config/env.service';

/**
 * Envio real de WhatsApp via Evolution API (self-hosted, gratuita).
 * Sem credenciais configuradas o sistema degrada para "modo link":
 * o job guarda o wa.me pré-preenchido e o dashboard exibe o botão de envio manual.
 */
@Injectable()
export class WhatsAppProvider {
  private readonly logger = new Logger(WhatsAppProvider.name);

  constructor(private readonly env: EnvService) {}

  get isConfigured(): boolean {
    const { url, apiKey, instance } = this.env.evolution;
    return Boolean(url && apiKey && instance);
  }

  /**
   * @param phone telefone com DDD (dígitos; DDI 55 é adicionado se ausente)
   * @returns true se enviou via API; false se está em modo link
   */
  async sendText(phone: string, text: string): Promise<boolean> {
    if (!this.isConfigured) return false;

    const digits = phone.replace(/\D/g, '');
    const number = digits.startsWith('55') ? digits : `55${digits}`;
    const { url, apiKey, instance } = this.env.evolution;

    const response = await fetch(`${url.replace(/\/$/, '')}/message/sendText/${instance}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: apiKey,
      },
      body: JSON.stringify({ number, text }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Evolution API ${response.status}: ${body.slice(0, 300)}`);
    }

    this.logger.log(`WhatsApp enviado para ${number.slice(0, 4)}****`);
    return true;
  }
}
