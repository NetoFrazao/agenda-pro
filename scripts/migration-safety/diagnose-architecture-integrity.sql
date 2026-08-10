-- Pré-check para migration 20260810010000_architecture_integrity
-- Rode ANTES de `prisma migrate deploy` em staging/clone (NUNCA produção às cegas).
-- Exit semantics (via diagnose.ps1 / diagnose.mjs):
--   overlaps ativos > 0  → BLOCKER (EXCLUDE GiST falha; migration NÃO dedupa overlaps)
--   phones / waitlist dups → WARNING (migration soft-delete / EXPIRE mantendo a linha mais antiga)

\echo '=== MIGRATION SAFETY: architecture_integrity ==='
\echo ''

\echo '--- 1) Overlaps ativos (mesmo professionalId) — BLOCKER se count > 0 ---'
WITH pairs AS (
  SELECT
    a.id AS id_a,
    b.id AS id_b,
    a."tenantId",
    a."professionalId",
    a."startsAt" AS starts_a,
    a."endsAt" AS ends_a,
    a.status AS status_a,
    b."startsAt" AS starts_b,
    b."endsAt" AS ends_b,
    b.status AS status_b
  FROM appointments a
  JOIN appointments b
    ON a."professionalId" = b."professionalId"
   AND a.id < b.id
   AND a.status IN ('PENDING_PAYMENT', 'SCHEDULED', 'CONFIRMED')
   AND b.status IN ('PENDING_PAYMENT', 'SCHEDULED', 'CONFIRMED')
   AND tstzrange(a."startsAt", a."endsAt", '[)') && tstzrange(b."startsAt", b."endsAt", '[)')
)
SELECT COUNT(*)::int AS overlap_pair_count FROM pairs;

SELECT
  id_a,
  id_b,
  "tenantId",
  "professionalId",
  starts_a,
  ends_a,
  status_a,
  starts_b,
  ends_b,
  status_b
FROM (
  SELECT
    a.id AS id_a,
    b.id AS id_b,
    a."tenantId",
    a."professionalId",
    a."startsAt" AS starts_a,
    a."endsAt" AS ends_a,
    a.status AS status_a,
    b."startsAt" AS starts_b,
    b."endsAt" AS ends_b,
    b.status AS status_b
  FROM appointments a
  JOIN appointments b
    ON a."professionalId" = b."professionalId"
   AND a.id < b.id
   AND a.status IN ('PENDING_PAYMENT', 'SCHEDULED', 'CONFIRMED')
   AND b.status IN ('PENDING_PAYMENT', 'SCHEDULED', 'CONFIRMED')
   AND tstzrange(a."startsAt", a."endsAt", '[)') && tstzrange(b."startsAt", b."endsAt", '[)')
) pairs
ORDER BY "professionalId", starts_a
LIMIT 50;

\echo ''
\echo '--- 2) Phones duplicados ativos por tenant — soft-delete (rn>1) na migration ---'
WITH ranked AS (
  SELECT
    id,
    "tenantId",
    phone,
    "createdAt",
    ROW_NUMBER() OVER (
      PARTITION BY "tenantId", phone
      ORDER BY "createdAt" ASC, id ASC
    ) AS rn
  FROM clients
  WHERE "deletedAt" IS NULL
),
dup_keys AS (
  SELECT "tenantId", phone, COUNT(*)::int AS active_rows
  FROM ranked
  GROUP BY "tenantId", phone
  HAVING COUNT(*) > 1
)
SELECT
  (SELECT COUNT(*)::int FROM dup_keys) AS duplicate_phone_keys,
  (SELECT COALESCE(SUM(active_rows - 1), 0)::int FROM dup_keys) AS would_soft_delete,
  (SELECT COUNT(*)::int FROM ranked WHERE rn = 1 AND ("tenantId", phone) IN (SELECT "tenantId", phone FROM dup_keys)) AS would_keep;

SELECT "tenantId", phone, active_rows, (active_rows - 1) AS would_soft_delete
FROM (
  SELECT "tenantId", phone, COUNT(*)::int AS active_rows
  FROM clients
  WHERE "deletedAt" IS NULL
  GROUP BY "tenantId", phone
  HAVING COUNT(*) > 1
) d
ORDER BY active_rows DESC, "tenantId", phone
LIMIT 50;

\echo ''
\echo '--- 3) Waitlist aberta duplicada (WAITING|NOTIFIED) — status=EXPIRED (rn>1) ---'
WITH ranked AS (
  SELECT
    id,
    "tenantId",
    "dateKey",
    "clientPhone",
    "createdAt",
    status,
    ROW_NUMBER() OVER (
      PARTITION BY "tenantId", "dateKey", "clientPhone"
      ORDER BY "createdAt" ASC, id ASC
    ) AS rn
  FROM waitlist_entries
  WHERE status IN ('WAITING', 'NOTIFIED')
),
dup_keys AS (
  SELECT "tenantId", "dateKey", "clientPhone", COUNT(*)::int AS open_rows
  FROM ranked
  GROUP BY "tenantId", "dateKey", "clientPhone"
  HAVING COUNT(*) > 1
)
SELECT
  (SELECT COUNT(*)::int FROM dup_keys) AS duplicate_waitlist_keys,
  (SELECT COALESCE(SUM(open_rows - 1), 0)::int FROM dup_keys) AS would_expire,
  (SELECT COUNT(*)::int FROM ranked WHERE rn = 1 AND ("tenantId", "dateKey", "clientPhone") IN (
    SELECT "tenantId", "dateKey", "clientPhone" FROM dup_keys
  )) AS would_keep;

SELECT "tenantId", "dateKey", "clientPhone", open_rows, (open_rows - 1) AS would_expire
FROM (
  SELECT "tenantId", "dateKey", "clientPhone", COUNT(*)::int AS open_rows
  FROM waitlist_entries
  WHERE status IN ('WAITING', 'NOTIFIED')
  GROUP BY "tenantId", "dateKey", "clientPhone"
  HAVING COUNT(*) > 1
) d
ORDER BY open_rows DESC, "tenantId", "dateKey"
LIMIT 50;

\echo ''
\echo '--- 4) Órfãos que a migration limpa (informativo) ---'
SELECT
  (SELECT COUNT(*)::int FROM waitlist_entries w
    WHERE w."serviceId" IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM services s WHERE s.id = w."serviceId")) AS waitlist_orphan_service,
  (SELECT COUNT(*)::int FROM waitlist_entries w
    WHERE w."professionalId" IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = w."professionalId")) AS waitlist_orphan_professional,
  (SELECT COUNT(*)::int FROM loyalty_transactions lt
    WHERE lt."appointmentId" IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM appointments a WHERE a.id = lt."appointmentId")) AS loyalty_orphan_appointment,
  (SELECT COUNT(*)::int FROM notification_jobs nj
    WHERE NOT EXISTS (SELECT 1 FROM tenants t WHERE t.id = nj."tenantId")) AS notification_orphan_tenant,
  (SELECT COUNT(*)::int FROM notification_jobs nj
    WHERE nj."appointmentId" IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM appointments a WHERE a.id = nj."appointmentId")) AS notification_orphan_appointment;

\echo ''
\echo '--- 5) Resumo máquina (uma linha) ---'
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
