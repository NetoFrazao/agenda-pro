import { PixChargeStatus } from '@prisma/client';
import { PaymentsController } from './payments.controller';

describe('PaymentsController — webhook MP signature gate', () => {
  function build(opts?: { signatureValid?: boolean; configured?: boolean }) {
    const confirmPaid = jest.fn().mockResolvedValue({ outcome: 'confirmed' });
    const releasePendingPayment = jest.fn();
    const markRefunded = jest.fn();
    const getPayment = jest.fn();
    const verifyWebhookSignature = jest.fn().mockReturnValue(opts?.signatureValid ?? false);
    const findUnique = jest.fn();

    const controller = new PaymentsController(
      { pixCharge: { findUnique } } as never,
      {
        isConfigured: opts?.configured ?? true,
        verifyWebhookSignature,
        getPayment,
      } as never,
      { confirmPaid, releasePendingPayment, markRefunded } as never,
    );

    return {
      controller,
      confirmPaid,
      getPayment,
      verifyWebhookSignature,
      findUnique,
    };
  }

  it('assinatura inválida não chama getPayment nem confirmPaid', async () => {
    const { controller, confirmPaid, getPayment, verifyWebhookSignature } = build({
      signatureValid: false,
    });

    const result = await controller.mercadopago(
      { type: 'payment', data: { id: '111' } },
      'ts=1,v1=bad',
      'req-1',
    );

    expect(result).toEqual({ ok: true });
    expect(verifyWebhookSignature).toHaveBeenCalledWith({
      xSignature: 'ts=1,v1=bad',
      xRequestId: 'req-1',
      dataId: '111',
    });
    expect(getPayment).not.toHaveBeenCalled();
    expect(confirmPaid).not.toHaveBeenCalled();
  });

  it('assinatura válida + approved confirma pagamento', async () => {
    const { controller, confirmPaid, getPayment, findUnique } = build({
      signatureValid: true,
    });
    getPayment.mockResolvedValue({
      id: 111,
      status: 'approved',
      external_reference: 'appt-1',
      transaction_amount: 25,
    });
    findUnique.mockResolvedValue({
      appointmentId: 'appt-1',
      amountCents: 2500,
      status: PixChargeStatus.PENDING,
      providerRef: '111',
    });

    const result = await controller.mercadopago(
      { type: 'payment', data: { id: 111 } },
      'ts=1,v1=ok',
      'req-1',
    );

    expect(result).toEqual({ ok: true });
    expect(confirmPaid).toHaveBeenCalledWith('appt-1');
  });

  it('MP não configurado ignora evento sem side-effects', async () => {
    const { controller, getPayment, verifyWebhookSignature } = build({
      configured: false,
      signatureValid: true,
    });

    await controller.mercadopago({ type: 'payment', data: { id: '1' } }, 'sig', 'rid');

    expect(verifyWebhookSignature).not.toHaveBeenCalled();
    expect(getPayment).not.toHaveBeenCalled();
  });

  it('valor divergente não confirma', async () => {
    const { controller, confirmPaid, getPayment, findUnique } = build({
      signatureValid: true,
    });
    getPayment.mockResolvedValue({
      id: 222,
      status: 'approved',
      external_reference: 'appt-2',
      transaction_amount: 99,
    });
    findUnique.mockResolvedValue({
      appointmentId: 'appt-2',
      amountCents: 2500,
      status: PixChargeStatus.PENDING,
      providerRef: '222',
    });

    await controller.mercadopago({ type: 'payment', data: { id: 222 } }, 'sig', 'rid');

    expect(confirmPaid).not.toHaveBeenCalled();
  });
});
