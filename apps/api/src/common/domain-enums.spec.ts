import { PixChargeStatus as PrismaPix } from '@prisma/client';
import { PIX_CHARGE_STATUSES } from './domain-enums';

describe('@agenda-pro/shared — alinhamento PixChargeStatus', () => {
  it('inclui REFUNDED e cobre o enum Prisma', () => {
    expect(PIX_CHARGE_STATUSES).toContain('REFUNDED');
    for (const status of Object.values(PrismaPix)) {
      expect(PIX_CHARGE_STATUSES).toContain(status);
    }
  });
});
