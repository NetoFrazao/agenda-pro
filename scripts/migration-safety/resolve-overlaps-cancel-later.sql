-- After auto-dedup succeeds but EXCLUDE still blocked: cancel overlapping seed pair (clone only).
-- Keeps the earlier appointment; cancels the overlapping later one.
UPDATE appointments a
SET status = 'CANCELLED',
    "cancelledAt" = NOW(),
    "cancelReason" = 'migration-safety: resolve overlap before EXCLUDE',
    "updatedAt" = NOW()
FROM appointments b
WHERE a."professionalId" = b."professionalId"
  AND a.id > b.id
  AND a.status IN ('PENDING_PAYMENT', 'SCHEDULED', 'CONFIRMED')
  AND b.status IN ('PENDING_PAYMENT', 'SCHEDULED', 'CONFIRMED')
  AND tstzrange(a."startsAt", a."endsAt", '[)') && tstzrange(b."startsAt", b."endsAt", '[)');
