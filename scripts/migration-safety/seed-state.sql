SELECT id, phone, ("deletedAt" IS NOT NULL) AS soft_deleted
FROM clients
WHERE id LIKE 'seed_client_%'
ORDER BY id;

SELECT id, status
FROM waitlist_entries
WHERE id LIKE 'seed_waitlist_%'
ORDER BY id;

SELECT id, status, "cancelReason"
FROM appointments
WHERE id LIKE 'seed_appt_%'
ORDER BY id;
