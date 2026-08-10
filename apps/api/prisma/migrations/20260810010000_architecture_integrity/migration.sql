-- Architecture integrity: FKs órfãs, uniques parciais, CHECKs e EXCLUDE GiST (overlap).
-- Idempotente o suficiente para re-run parcial (IF NOT EXISTS / DO blocks).

-- ---------------------------------------------------------------------------
-- 0) Extensão para EXCLUDE (professionalId = + range &&)
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ---------------------------------------------------------------------------
-- 1) Limpeza de FKs órfãs antes de criar constraints
-- ---------------------------------------------------------------------------
UPDATE "waitlist_entries" w
SET "serviceId" = NULL
WHERE w."serviceId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "services" s WHERE s."id" = w."serviceId");

UPDATE "waitlist_entries" w
SET "professionalId" = NULL
WHERE w."professionalId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "users" u WHERE u."id" = w."professionalId");

UPDATE "loyalty_transactions" lt
SET "appointmentId" = NULL
WHERE lt."appointmentId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "appointments" a WHERE a."id" = lt."appointmentId");

DELETE FROM "notification_jobs" nj
WHERE NOT EXISTS (SELECT 1 FROM "tenants" t WHERE t."id" = nj."tenantId");

UPDATE "notification_jobs" nj
SET "appointmentId" = NULL
WHERE nj."appointmentId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "appointments" a WHERE a."id" = nj."appointmentId");

-- ---------------------------------------------------------------------------
-- 2) FKs
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'waitlist_entries_serviceId_fkey'
  ) THEN
    ALTER TABLE "waitlist_entries"
      ADD CONSTRAINT "waitlist_entries_serviceId_fkey"
      FOREIGN KEY ("serviceId") REFERENCES "services"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'waitlist_entries_professionalId_fkey'
  ) THEN
    ALTER TABLE "waitlist_entries"
      ADD CONSTRAINT "waitlist_entries_professionalId_fkey"
      FOREIGN KEY ("professionalId") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'loyalty_transactions_appointmentId_fkey'
  ) THEN
    ALTER TABLE "loyalty_transactions"
      ADD CONSTRAINT "loyalty_transactions_appointmentId_fkey"
      FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'notification_jobs_tenantId_fkey'
  ) THEN
    ALTER TABLE "notification_jobs"
      ADD CONSTRAINT "notification_jobs_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'notification_jobs_appointmentId_fkey'
  ) THEN
    ALTER TABLE "notification_jobs"
      ADD CONSTRAINT "notification_jobs_appointmentId_fkey"
      FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3) Uniques parciais (phone / waitlist aberta)
-- Dedup defensivo: mantém a linha mais antiga por chave
-- ---------------------------------------------------------------------------
WITH dups AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY "tenantId", phone
           ORDER BY "createdAt" ASC, id ASC
         ) AS rn
  FROM "clients"
  WHERE "deletedAt" IS NULL
)
UPDATE "clients" c
SET "deletedAt" = NOW()
FROM dups
WHERE c.id = dups.id AND dups.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "clients_tenantId_phone_active_key"
ON "clients" ("tenantId", "phone")
WHERE "deletedAt" IS NULL;

WITH wdup AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY "tenantId", "dateKey", "clientPhone"
           ORDER BY "createdAt" ASC, id ASC
         ) AS rn
  FROM "waitlist_entries"
  WHERE status IN ('WAITING', 'NOTIFIED')
)
UPDATE "waitlist_entries" w
SET status = 'EXPIRED'
FROM wdup
WHERE w.id = wdup.id AND wdup.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "waitlist_tenant_date_phone_open_key"
ON "waitlist_entries" ("tenantId", "dateKey", "clientPhone")
WHERE status IN ('WAITING', 'NOTIFIED');

-- ---------------------------------------------------------------------------
-- 4) CHECKs de domínio
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'appointments_ends_after_starts') THEN
    ALTER TABLE "appointments"
      ADD CONSTRAINT "appointments_ends_after_starts"
      CHECK ("endsAt" > "startsAt");
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'appointments_price_nonneg') THEN
    ALTER TABLE "appointments"
      ADD CONSTRAINT "appointments_price_nonneg"
      CHECK ("priceCentsSnapshot" >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'appointments_duration_positive') THEN
    ALTER TABLE "appointments"
      ADD CONSTRAINT "appointments_duration_positive"
      CHECK ("durationMinutesSnapshot" > 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'services_duration_positive') THEN
    ALTER TABLE "services"
      ADD CONSTRAINT "services_duration_positive"
      CHECK ("durationMinutes" > 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'services_price_nonneg') THEN
    ALTER TABLE "services"
      ADD CONSTRAINT "services_price_nonneg"
      CHECK ("priceCents" >= 0 AND "depositCents" >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reviews_rating_range') THEN
    ALTER TABLE "reviews"
      ADD CONSTRAINT "reviews_rating_range"
      CHECK ("rating" >= 1 AND "rating" <= 5);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_commission_range') THEN
    ALTER TABLE "users"
      ADD CONSTRAINT "users_commission_range"
      CHECK ("commissionPercent" >= 0 AND "commissionPercent" <= 100);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clients_loyalty_nonneg') THEN
    ALTER TABLE "clients"
      ADD CONSTRAINT "clients_loyalty_nonneg"
      CHECK ("loyaltyPoints" >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenants_buffer_nonneg') THEN
    ALTER TABLE "tenants"
      ADD CONSTRAINT "tenants_buffer_nonneg"
      CHECK ("bufferMinutes" >= 0 AND "minNoticeMinutes" >= 0 AND "maxAdvanceDays" > 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'availability_rules_day_range') THEN
    ALTER TABLE "availability_rules"
      ADD CONSTRAINT "availability_rules_day_range"
      CHECK ("dayOfWeek" >= 0 AND "dayOfWeek" <= 6 AND "startMinute" < "endMinute");
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 5) EXCLUDE GiST — rede de segurança contra overlap de ativos
-- (bufferMinutes continua só na app; este CHECK cobre startsAt/endsAt crus)
-- Falha se já existirem overlaps ativos — nesse caso, limpar antes do deploy.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'appointments_no_overlap_active'
  ) THEN
    ALTER TABLE "appointments"
      ADD CONSTRAINT "appointments_no_overlap_active"
      EXCLUDE USING gist (
        "professionalId" WITH =,
        tstzrange("startsAt", "endsAt", '[)') WITH &&
      )
      WHERE (status IN ('PENDING_PAYMENT', 'SCHEDULED', 'CONFIRMED'));
  END IF;
END $$;
