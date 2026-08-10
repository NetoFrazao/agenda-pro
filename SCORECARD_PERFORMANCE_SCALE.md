# SCORECARD — Performance & Escalabilidade

**Data:** 2026-08-09 (ciclo agent-performance)  
**Branch:** `cursor/agent-performance` (base: `cursor/saas-hardening-crm-infra`)  
**Escopo permitido:** `pix-lifecycle.service.ts`, `redis-cache.service.ts`, `clients/*.service.ts` (segmentação), `worker.ts`  
**Método:** implementação + unit tests (sem load test)  
**Nota geral:** **9.0 / 10**

---

## Critérios

| Critério | Antes | Agora | Comentário |
|----------|-------|-------|------------|
| Workers / background | 8.5 | **8.5** | Worker separado intacto |
| Cache Redis | 8 | **9** | Circuit breaker + reconnect após cooldown (não desliga até restart) |
| Multi-réplica API | 8 | **8** | Sem mudança |
| Multi-réplica worker | 6 | **9** | Lock Redis SET NX no reconcile PIX |
| Queries / CRM segment | 5 | **8.5** | Filtro + paginação no SQL (sem full-scan JS) |
| Observabilidade fila | 3 | **7** | Log periódico waiting/active/delayed/failed + latencyP95Ms |
| Pool / infra | 7.5 | **7.5** | Sem mudança |
| Frontend | 6 | **6** | Fora de escopo |
| **Geral** | **8.0** | **9.0** | Itens alto/médio do backlog fechados |

---

## Backlog deste ciclo

| Prioridade | Item | Status |
|------------|------|--------|
| Alto | Leader election / lock distribuído PIX | **Feito** — `SET NX EX` em `lock:pix:reconcile` (TTL 55s) |
| Médio | Circuit breaker Redis cache | **Feito** — abre ~5s, tenta reconectar; leave-behind `disabled` permanente |
| Médio | Segmentação CRM sem full-scan JS | **Feito** — CTE + CASE no Postgres + LIMIT/OFFSET |
| Baixo | Métricas básicas de fila | **Feito** — log JSON `queue.metrics` no `worker.ts` a cada 60s |

---

## Breaking / avisos de comportamento

1. **PIX reconcile com multi-réplica:** com Redis saudável, só **um** worker por janela executa `findMany`/release. Antes, N réplicas rodavam a mesma consulta (idempotente, mas N× carga).  
   - Se Redis estiver down: **degrade** — todos os workers rodam (comportamento antigo); log de warn.
2. **Cache Redis:** após falha, cache volta a tentar após ~5s (antes ficava off até restart). Observável: mais hits/tentativas de Redis após blips.
3. **CRM `?segment=`:** total/páginas devem permanecer corretos; implementação mudou de rank-in-memory para SQL. Regras CASE alinhadas a `resolveClientSegment` (60d/30d/vip 10|R$500/frequent 3).  
   - **Aviso:** busca `search` no path segmentado usa `ILIKE`/`LIKE` no SQL (equivalente prático ao Prisma `contains`); edge cases de collation Unicode são os do Postgres.
4. **Métricas de fila:** só logs estruturados no worker — sem novo endpoint HTTP (evita tocar controllers fora de escopo).

---

## Dependências fora de escopo (não tocadas)

- Materializar segmento / índice dedicado para mega-tenants (CTE ainda agrega COMPLETED do tenant).
- Expor métricas em `/health` ou Prometheus (exigiria `health` / controllers).
- Mover reconcile PIX para job BullMQ repetível (alternativa ao SET NX; não necessário agora).

---

## Arquivos tocados

| Arquivo | Mudança |
|---------|---------|
| `apps/api/src/payments/pix-lifecycle.service.ts` | Lock distribuído antes do reconcile |
| `apps/api/src/payments/pix-lifecycle.service.spec.ts` | Testes lock busy/acquired/unavailable |
| `apps/api/src/common/cache/redis-cache.service.ts` | Circuit breaker + `tryAcquireLock` |
| `apps/api/src/common/cache/redis-cache.service.spec.ts` | Testes circuito + lock |
| `apps/api/src/clients/clients.service.ts` | `findClientIdsBySegment` via `$queryRaw` |
| `apps/api/src/clients/clients-segment-rank.spec.ts` | Testes path SQL |
| `apps/api/src/worker.ts` | Métricas BullMQ periódicas |
| `SCORECARD_PERFORMANCE_SCALE.md` | Este scorecard |

---

## Verificação

```bash
npm run lint -w @agenda-pro/api   # OK (0 warnings)
npm run prisma:generate -w @agenda-pro/api
npm run test -w @agenda-pro/api
```

**Resultados (2026-08-09):**
- Lint: **pass**
- Suite focada (`pix-lifecycle|redis-cache|clients-segment|client-segment`): **4 suites / 22 tests pass**
- Suite completa: **24 pass / 1 fail** — `appointments-security.spec.ts` (`rescheduleByToken` mock incompleto). **Pré-existente na base** `saas-hardening-crm-infra` (reproduz sem as mudanças deste ciclo). Fora do escopo deste agente.

---

## Veredito

**9.0/10** — multi-worker PIX seguro com Redis, cache auto-recupera, CRM segment escala com SQL, fila visível nos logs do worker. Falta materialização/métricas HTTP e load test para cravar 10.
