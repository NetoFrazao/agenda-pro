-- Fase 7 Performance: índice CRM metrics (groupBy clientId + status + startsAt).
-- Não duplica índices Infra (tenantId+status+startsAt, status+createdAt, etc.).

CREATE INDEX "appointments_tenantId_clientId_status_startsAt_idx"
  ON "appointments"("tenantId", "clientId", "status", "startsAt");
