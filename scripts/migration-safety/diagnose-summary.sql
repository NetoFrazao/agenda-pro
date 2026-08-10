-- Machine-readable one-row summary for diagnose runners.
-- Columns: overlap_pairs | phone_soft_deletes | waitlist_expires | verdict
WITH
overlap AS (
  SELECT COUNT(*)::int AS c
  FROM appointments a
  JOIN appointments b
    ON a."professionalId" = b."professionalId"
   AND a.id < b.id
   AND a.status IN ('PENDING_PAYMENT', 'SCHEDULED', 'CONFIRMED')
   AND b.status IN ('PENDING_PAYMENT', 'SCHEDULED', 'CONFIRMED')
   AND tstzrange(a."startsAt", a."endsAt", '[)') && tstzrange(b."startsAt", b."endsAt", '[)')
),
phone AS (
  SELECT COALESCE(SUM(cnt - 1), 0)::int AS would_soft_delete
  FROM (
    SELECT COUNT(*) AS cnt
    FROM clients
    WHERE "deletedAt" IS NULL
    GROUP BY "tenantId", phone
    HAVING COUNT(*) > 1
  ) x
),
waitlist AS (
  SELECT COALESCE(SUM(cnt - 1), 0)::int AS would_expire
  FROM (
    SELECT COUNT(*) AS cnt
    FROM waitlist_entries
    WHERE status IN ('WAITING', 'NOTIFIED')
    GROUP BY "tenantId", "dateKey", "clientPhone"
    HAVING COUNT(*) > 1
  ) x
)
SELECT
  overlap.c AS overlap_pairs,
  phone.would_soft_delete AS phone_soft_deletes,
  waitlist.would_expire AS waitlist_expires,
  CASE
    WHEN overlap.c > 0 THEN 'BLOCK'
    WHEN phone.would_soft_delete > 0 OR waitlist.would_expire > 0 THEN 'WARN_DEDUP'
    ELSE 'OK'
  END AS verdict
FROM overlap, phone, waitlist;
