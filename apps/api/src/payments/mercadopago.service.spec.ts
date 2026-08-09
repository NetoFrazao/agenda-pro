import { createHmac } from 'crypto';
import { MercadoPagoService } from './mercadopago.service';

function buildXSignature(secret: string, dataId: string, requestId: string, ts: string): string {
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const v1 = createHmac('sha256', secret).update(manifest).digest('hex');
  return `ts=${ts},v1=${v1}`;
}

describe('MercadoPagoService.verifyWebhookSignature', () => {
  const secret = 'mp_webhook_secret_test_0123456789';
  const dataId = '1234567890';
  const requestId = 'req-abc-001';
  const ts = '1700000000';

  function build(env: {
    mercadoPagoWebhookSecret?: string;
    mercadoPagoAccessToken?: string;
    nodeEnv?: string;
  }) {
    return new MercadoPagoService({
      mercadoPagoWebhookSecret: env.mercadoPagoWebhookSecret ?? '',
      mercadoPagoAccessToken: env.mercadoPagoAccessToken ?? '',
      nodeEnv: env.nodeEnv ?? 'test',
    } as never);
  }

  it('aceita assinatura HMAC válida (x-signature v1)', () => {
    const service = build({ mercadoPagoWebhookSecret: secret });
    const xSignature = buildXSignature(secret, dataId, requestId, ts);
    expect(
      service.verifyWebhookSignature({
        xSignature,
        xRequestId: requestId,
        dataId,
      }),
    ).toBe(true);
  });

  it('rejeita assinatura adulterada', () => {
    const service = build({ mercadoPagoWebhookSecret: secret });
    const xSignature = buildXSignature(secret, dataId, requestId, ts).replace(
      /v1=[0-9a-f]+/,
      'v1=' + 'ab'.repeat(32),
    );
    expect(
      service.verifyWebhookSignature({
        xSignature,
        xRequestId: requestId,
        dataId,
      }),
    ).toBe(false);
  });

  it('rejeita dataId diferente do manifesto assinado', () => {
    const service = build({ mercadoPagoWebhookSecret: secret });
    const xSignature = buildXSignature(secret, dataId, requestId, ts);
    expect(
      service.verifyWebhookSignature({
        xSignature,
        xRequestId: requestId,
        dataId: '999',
      }),
    ).toBe(false);
  });

  it('rejeita quando falta x-signature ou x-request-id', () => {
    const service = build({ mercadoPagoWebhookSecret: secret });
    expect(
      service.verifyWebhookSignature({
        xSignature: undefined,
        xRequestId: requestId,
        dataId,
      }),
    ).toBe(false);
    expect(
      service.verifyWebhookSignature({
        xSignature: buildXSignature(secret, dataId, requestId, ts),
        xRequestId: undefined,
        dataId,
      }),
    ).toBe(false);
  });

  it('rejeita header sem ts/v1', () => {
    const service = build({ mercadoPagoWebhookSecret: secret });
    expect(
      service.verifyWebhookSignature({
        xSignature: 'foo=bar',
        xRequestId: requestId,
        dataId,
      }),
    ).toBe(false);
  });

  it('em production sem segredo: fail-closed (false)', () => {
    const service = build({ mercadoPagoWebhookSecret: '', nodeEnv: 'production' });
    expect(
      service.verifyWebhookSignature({
        xSignature: 'ts=1,v1=abc',
        xRequestId: requestId,
        dataId,
      }),
    ).toBe(false);
  });

  it('em non-prod sem segredo: aceita (dev convenience)', () => {
    const service = build({ mercadoPagoWebhookSecret: '', nodeEnv: 'development' });
    expect(
      service.verifyWebhookSignature({
        xSignature: undefined,
        xRequestId: undefined,
        dataId,
      }),
    ).toBe(true);
  });

  it('isConfigured reflete access token', () => {
    expect(build({ mercadoPagoAccessToken: '' }).isConfigured).toBe(false);
    expect(build({ mercadoPagoAccessToken: 'APP_USR-x' }).isConfigured).toBe(true);
  });
});
