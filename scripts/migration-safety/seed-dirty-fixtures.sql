-- Dirty fixtures for clone-only migrate rehearsal.
-- Requires existing demo tenant/user/service (bootstrap-local).
-- Inserts: overlapping appointments, duplicate phones, duplicate open waitlist.

DO $$
DECLARE
  v_tenant_id TEXT;
  v_pro_id TEXT;
  v_service_id TEXT;
  v_client_keep TEXT := 'seed_client_keep_phone';
  v_client_dup TEXT := 'seed_client_dup_phone';
  v_appt_a TEXT := 'seed_appt_overlap_a';
  v_appt_b TEXT := 'seed_appt_overlap_b';
  v_wl_a TEXT := 'seed_waitlist_open_a';
  v_wl_b TEXT := 'seed_waitlist_open_b';
BEGIN
  SELECT id INTO v_tenant_id FROM tenants ORDER BY "createdAt" ASC LIMIT 1;
  SELECT id INTO v_pro_id FROM users WHERE "tenantId" = v_tenant_id ORDER BY "createdAt" ASC LIMIT 1;
  SELECT id INTO v_service_id FROM services WHERE "tenantId" = v_tenant_id ORDER BY "createdAt" ASC LIMIT 1;

  IF v_tenant_id IS NULL OR v_pro_id IS NULL OR v_service_id IS NULL THEN
    RAISE EXCEPTION 'seed-dirty: missing tenant/user/service — bootstrap demo first';
  END IF;

  -- Clean previous seed rows (idempotent re-run)
  DELETE FROM appointments WHERE id IN (v_appt_a, v_appt_b);
  DELETE FROM waitlist_entries WHERE id IN (v_wl_a, v_wl_b);
  DELETE FROM clients WHERE id IN (v_client_keep, v_client_dup);

  INSERT INTO clients (id, "tenantId", name, phone, "loyaltyPoints", "marketingOptIn", tags, "createdAt", "updatedAt")
  VALUES
    (v_client_keep, v_tenant_id, 'Seed Keep', '11999990001', 0, false, ARRAY[]::text[], NOW() - INTERVAL '2 days', NOW()),
    (v_client_dup,  v_tenant_id, 'Seed Dup',  '11999990001', 0, false, ARRAY[]::text[], NOW() - INTERVAL '1 day',  NOW());

  -- Overlap: same pro, different startsAt (phase1 unique allows this), ranges overlap
  INSERT INTO appointments (
    id, "tenantId", "professionalId", "clientId", "serviceId",
    "startsAt", "endsAt", status, "manageToken",
    "priceCentsSnapshot", "durationMinutesSnapshot",
    "createdAt", "updatedAt"
  ) VALUES
    (
      v_appt_a, v_tenant_id, v_pro_id, v_client_keep, v_service_id,
      TIMESTAMP '2030-01-15 14:00:00', TIMESTAMP '2030-01-15 15:00:00',
      'SCHEDULED', 'seed-manage-token-overlap-a',
      5000, 60, NOW(), NOW()
    ),
    (
      v_appt_b, v_tenant_id, v_pro_id, v_client_keep, v_service_id,
      TIMESTAMP '2030-01-15 14:30:00', TIMESTAMP '2030-01-15 15:30:00',
      'CONFIRMED', 'seed-manage-token-overlap-b',
      5000, 60, NOW(), NOW()
    );

  INSERT INTO waitlist_entries (
    id, "tenantId", "serviceId", "professionalId", "dateKey",
    "clientName", "clientPhone", status, "createdAt", "updatedAt"
  ) VALUES
    (
      v_wl_a, v_tenant_id, v_service_id, v_pro_id, '2030-02-01',
      'Wait Keep', '11988887777', 'WAITING', NOW() - INTERVAL '2 hours', NOW()
    ),
    (
      v_wl_b, v_tenant_id, v_service_id, v_pro_id, '2030-02-01',
      'Wait Dup', '11988887777', 'NOTIFIED', NOW() - INTERVAL '1 hour', NOW()
    );
END $$;
