-- CreateEnum
CREATE TYPE "PixChargeStatus" AS ENUM ('PENDING', 'PAID', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WaitlistStatus" AS ENUM ('WAITING', 'NOTIFIED', 'BOOKED', 'EXPIRED');

-- AlterEnum
ALTER TYPE "NotificationJobType" ADD VALUE 'PASSWORD_RESET';
ALTER TYPE "NotificationJobType" ADD VALUE 'WAITLIST_SLOT_OPEN';

-- AlterTable (backfill seguro para bancos com agendamentos existentes)
ALTER TABLE "appointments" ADD COLUMN     "manageToken" TEXT;
UPDATE "appointments" SET "manageToken" = md5(random()::text || clock_timestamp()::text) WHERE "manageToken" IS NULL;
ALTER TABLE "appointments" ALTER COLUMN "manageToken" SET NOT NULL;

-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "loyaltyPoints" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "about" VARCHAR(500),
ADD COLUMN     "address" VARCHAR(255),
ADD COLUMN     "bufferMinutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "cancelMinHours" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "loyaltyEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "loyaltyPointsPerReal" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "maxAdvanceDays" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN     "minNoticeMinutes" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN     "slotGridMinutes" INTEGER NOT NULL DEFAULT 15,
ADD COLUMN     "whatsapp" VARCHAR(32);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "commissionPercent" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pix_charges" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "provider" VARCHAR(32) NOT NULL DEFAULT 'mercadopago',
    "providerRef" VARCHAR(64),
    "amountCents" INTEGER NOT NULL,
    "status" "PixChargeStatus" NOT NULL DEFAULT 'PENDING',
    "copyPaste" TEXT,
    "qrCodeBase64" TEXT,
    "expiresAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pix_charges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "waitlist_entries" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "serviceId" TEXT,
    "professionalId" TEXT,
    "dateKey" VARCHAR(10) NOT NULL,
    "clientName" VARCHAR(120) NOT NULL,
    "clientPhone" VARCHAR(32) NOT NULL,
    "clientEmail" VARCHAR(255),
    "status" "WaitlistStatus" NOT NULL DEFAULT 'WAITING',
    "notifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "waitlist_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" VARCHAR(500),
    "clientName" VARCHAR(120) NOT NULL,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_tokenHash_key" ON "password_reset_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_userId_idx" ON "password_reset_tokens"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "pix_charges_appointmentId_key" ON "pix_charges"("appointmentId");

-- CreateIndex
CREATE UNIQUE INDEX "pix_charges_providerRef_key" ON "pix_charges"("providerRef");

-- CreateIndex
CREATE INDEX "pix_charges_tenantId_status_idx" ON "pix_charges"("tenantId", "status");

-- CreateIndex
CREATE INDEX "waitlist_entries_tenantId_dateKey_status_idx" ON "waitlist_entries"("tenantId", "dateKey", "status");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_appointmentId_key" ON "reviews"("appointmentId");

-- CreateIndex
CREATE INDEX "reviews_tenantId_isPublished_idx" ON "reviews"("tenantId", "isPublished");

-- CreateIndex
CREATE UNIQUE INDEX "appointments_manageToken_key" ON "appointments"("manageToken");

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pix_charges" ADD CONSTRAINT "pix_charges_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pix_charges" ADD CONSTRAINT "pix_charges_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
