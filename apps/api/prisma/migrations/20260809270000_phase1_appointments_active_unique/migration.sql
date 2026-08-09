-- Unique parcial: só appointments ativos ocupam (professionalId, startsAt).
-- Permite rebook após CANCELLED / NO_SHOW / COMPLETED / EXPIRED lifecycle.

DROP INDEX IF EXISTS "appointments_professionalId_startsAt_key";

CREATE UNIQUE INDEX "appointments_professionalId_startsAt_active_key"
ON "appointments" ("professionalId", "startsAt")
WHERE status IN ('PENDING_PAYMENT', 'SCHEDULED', 'CONFIRMED');
