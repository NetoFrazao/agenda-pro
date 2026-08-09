-- Infra: índices compostos justificados por queries reais (reports, CRM, PIX lifecycle).
-- Lock risk: CREATE INDEX (não CONCURRENTLY) adquire ShareLock na tabela — bloqueia
-- writes que precisam de AccessExclusive, mas permite SELECT/INSERT/UPDATE normais na
-- maioria dos casos no PG. Em tabelas grandes em produção, preferir janela de baixo
-- tráfego ou reaplicar com CREATE INDEX CONCURRENTLY fora do Prisma (manual).
-- Tabelas quentes: appointments, pix_charges.

-- CreateIndex
CREATE INDEX "services_tenantId_deletedAt_idx" ON "services"("tenantId", "deletedAt");

-- CreateIndex
CREATE INDEX "clients_tenantId_deletedAt_idx" ON "clients"("tenantId", "deletedAt");

-- CreateIndex
CREATE INDEX "appointments_tenantId_status_startsAt_idx" ON "appointments"("tenantId", "status", "startsAt");

-- CreateIndex
CREATE INDEX "appointments_status_createdAt_idx" ON "appointments"("status", "createdAt");

-- CreateIndex
CREATE INDEX "pix_charges_status_expiresAt_idx" ON "pix_charges"("status", "expiresAt");
