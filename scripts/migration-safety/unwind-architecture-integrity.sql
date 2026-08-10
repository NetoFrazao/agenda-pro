-- Unwind objects from 20260810010000_architecture_integrity on a CLONE DB only.
-- Purpose: re-run migrate deploy against a copy that already had the migration applied.
-- NEVER run against production.

ALTER TABLE IF EXISTS "appointments" DROP CONSTRAINT IF EXISTS "appointments_no_overlap_active";
DROP TRIGGER IF EXISTS appointments_set_slot_range_trg ON "appointments";
DROP FUNCTION IF EXISTS appointments_set_slot_range();
ALTER TABLE IF EXISTS "appointments" DROP COLUMN IF EXISTS "slotRange";

DROP INDEX IF EXISTS "clients_tenantId_phone_active_key";
DROP INDEX IF EXISTS "waitlist_tenant_date_phone_open_key";

ALTER TABLE IF EXISTS "waitlist_entries" DROP CONSTRAINT IF EXISTS "waitlist_entries_serviceId_fkey";
ALTER TABLE IF EXISTS "waitlist_entries" DROP CONSTRAINT IF EXISTS "waitlist_entries_professionalId_fkey";
ALTER TABLE IF EXISTS "loyalty_transactions" DROP CONSTRAINT IF EXISTS "loyalty_transactions_appointmentId_fkey";
ALTER TABLE IF EXISTS "notification_jobs" DROP CONSTRAINT IF EXISTS "notification_jobs_tenantId_fkey";
ALTER TABLE IF EXISTS "notification_jobs" DROP CONSTRAINT IF EXISTS "notification_jobs_appointmentId_fkey";

ALTER TABLE IF EXISTS "appointments" DROP CONSTRAINT IF EXISTS "appointments_ends_after_starts";
ALTER TABLE IF EXISTS "appointments" DROP CONSTRAINT IF EXISTS "appointments_price_nonneg";
ALTER TABLE IF EXISTS "appointments" DROP CONSTRAINT IF EXISTS "appointments_duration_positive";
ALTER TABLE IF EXISTS "services" DROP CONSTRAINT IF EXISTS "services_duration_positive";
ALTER TABLE IF EXISTS "services" DROP CONSTRAINT IF EXISTS "services_price_nonneg";
ALTER TABLE IF EXISTS "reviews" DROP CONSTRAINT IF EXISTS "reviews_rating_range";
ALTER TABLE IF EXISTS "users" DROP CONSTRAINT IF EXISTS "users_commission_range";
ALTER TABLE IF EXISTS "clients" DROP CONSTRAINT IF EXISTS "clients_loyalty_nonneg";
ALTER TABLE IF EXISTS "tenants" DROP CONSTRAINT IF EXISTS "tenants_buffer_nonneg";
ALTER TABLE IF EXISTS "availability_rules" DROP CONSTRAINT IF EXISTS "availability_rules_day_range";

DELETE FROM "_prisma_migrations"
WHERE migration_name = '20260810010000_architecture_integrity';
