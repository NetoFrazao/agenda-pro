# Infra → Engineering / Performance requests

Pedidos do agente de Infraestrutura. **Nenhuma alteração de regra de negócio** foi feita pelo Infra além de health/ready (exceção documentada) e índices Prisma.

---

## [INFRA → ENGINEERING]

Feature: Reconciliação de `NotificationJob` após flush/perda do Redis  
Necessidade: Jobs PENDING no outbox devem ser re-enfileirados no BullMQ quando Redis volta (AUDIT M-06).  
Evidência: Worker/Queue no mesmo processo; degradação já loga e deixa jobs só no banco.  
Sugestão: cron/interval que `findMany` `status=PENDING AND scheduledFor <= now` e re-adiciona à fila (índice `(status, scheduledFor)` já existe).  
Índice `notification_jobs(appointmentId)`: só adicionar quando existir query de cancelamento de reminders por appointment — hoje não há.

---

## [INFRA → ENGINEERING]

Feature: Worker BullMQ separado do HTTP (AUDIT B-13)  
Necessidade: Restart/deploy da API não deve derrubar processamento prolongado; escala independente.  
Sugestão: entrypoint `node dist/worker.js` + compose service `worker` compartilhando imagem da API. Infra deixa compose pronto para receber o processo quando existir.

---

## [INFRA → ENGINEERING]

Feature: FK waitlist `serviceId` / `professionalId`  
Necessidade: Integridade referencial (AUDIT M-02 / §11).  
Sugestão: migration Engineering (valida IDs no book waitlist + FK). Infra **não** adicionou FK para não conflitar com Fase 3 / waitlist em andamento.

**Update Fase 4 (Engineering):** validação de `serviceId` no tenant implementada em `waitlist.service.ts`. FK no schema permanece **opcional** — se Infra quiser adicionar, usar migration nova (não reescrever `20260809223000_phase4_pix_refunded`).

---

## [INFRA → ENGINEERING]

Feature: Paginação / teto em listagens de appointments  
Necessidade: `list()` usa `take: 500` sem cursor — risco de payload grande sob tenants ativos.  
Arquivo: `apps/api/src/appointments/appointments.service.ts` (Fase 3 — **não alterado pelo Infra**).  
Sugestão: cursor/`from`/`to` obrigatórios + limite ≤ 100; índice `(tenantId, startsAt)` já cobre.

**Update Fase 7 (Engineering):** paginação `page`/`pageSize` (max 100) + resposta `{ items, total, page, pageSize }` + select mínimo. `from`/`to` continuam recomendados (UI já envia).

---

## [PERFORMANCE ISSUE]

Área: CRM clients N+1-ish / agregações  
Evidência: `clients.service` lista página + `groupBy` appointments por `clientId` (OK para pageSize=20); busca `contains` em `name` sem índice trigram.  
Sugestão: sob carga, `pg_trgm` GIN em `clients.name` **ou** busca só por phone/email (já indexados). Não implementado — requer decisão de produto.

---

## [PERFORMANCE ISSUE]

Área: Reports múltiplos `groupBy` no mesmo range  
Evidência: `reports.service` vários `groupBy` paralelos em `appointments` com `tenantId + startsAt + status`.  
Mitigação infra: índice `(tenantId, status, startsAt)` adicionado.  
Residual: se reports crescerem, materializar summary diário (Engineering).

---

## [PERFORMANCE ISSUE]

Área: PIX reconcile full-table-ish  
Evidência: `pix-lifecycle` `findMany` global `status=PENDING` + `expiresAt` / órfãos `PENDING_PAYMENT` por `createdAt`.  
Mitigação infra: índices `(status, expiresAt)` e `(status, createdAt)`.  
Sugestão Engineering: limitar por `take` + loop (já `take: 100`) e métrica de “released/min”.

---

## [INFRA → ENGINEERING]

Feature: Health depth da fila BullMQ  
Necessidade: AUDIT M-12 pediu profundidade da fila; Infra entregou ping Redis + ready.  
Sugestão: expor `queue.getJobCounts()` em `/api/health/ready` (ou métrica interna) sem auth em prod? Preferir endpoint autenticado ops ou métrica Prometheus depois.

---

## [INFRA → DESIGN]

N/A visual. `next.config.ts` ganhou `output: 'standalone'` só para Docker Web — sem mudança de UI.
