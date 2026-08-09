-- Phase 4: PixChargeStatus.REFUNDED (financeiro / webhook MP refunded)
-- Recria o enum de forma compatível com transaction do Prisma migrate.

CREATE TYPE "PixChargeStatus_new" AS ENUM ('PENDING', 'PAID', 'EXPIRED', 'CANCELLED', 'REFUNDED');

ALTER TABLE "pix_charges" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "pix_charges"
  ALTER COLUMN "status" TYPE "PixChargeStatus_new"
  USING ("status"::text::"PixChargeStatus_new");

DROP TYPE "PixChargeStatus";
ALTER TYPE "PixChargeStatus_new" RENAME TO "PixChargeStatus";

ALTER TABLE "pix_charges" ALTER COLUMN "status" SET DEFAULT 'PENDING';
