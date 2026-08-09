-- Fase 5: CRM tags/birthday + ledger de fidelidade (idempotente por appointment)

-- AlterTable
ALTER TABLE "clients" ADD COLUMN "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "clients" ADD COLUMN "birthday" DATE;

-- CreateEnum
CREATE TYPE "LoyaltyTxnType" AS ENUM ('CREDIT', 'DEBIT');

-- CreateTable
CREATE TABLE "loyalty_transactions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "type" "LoyaltyTxnType" NOT NULL,
    "points" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "ref" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loyalty_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "loyalty_transactions_tenantId_clientId_createdAt_idx" ON "loyalty_transactions"("tenantId", "clientId", "createdAt");

-- CreateIndex
CREATE INDEX "loyalty_transactions_tenantId_createdAt_idx" ON "loyalty_transactions"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "loyalty_transactions_appointmentId_type_key" ON "loyalty_transactions"("appointmentId", "type");

-- AddForeignKey
ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Migra saldo existente sem appointment (trilha MIGRATION; não duplica se reaplicar)
INSERT INTO "loyalty_transactions" ("id", "tenantId", "clientId", "appointmentId", "type", "points", "reason", "ref", "createdAt")
SELECT
  'mig_' || c."id",
  c."tenantId",
  c."id",
  NULL,
  'CREDIT',
  c."loyaltyPoints",
  'MIGRATION',
  'phase5_opening_balance',
  CURRENT_TIMESTAMP
FROM "clients" c
WHERE c."loyaltyPoints" > 0
  AND NOT EXISTS (
    SELECT 1 FROM "loyalty_transactions" lt
    WHERE lt."clientId" = c."id" AND lt."reason" = 'MIGRATION'
  );
