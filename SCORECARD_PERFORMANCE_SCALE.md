# SCORECARD — Performance & Escalabilidade

**Data:** 2026-08-09  
**Escopo:** worker separado, cache Redis de slots, gating `PROCESS_ROLE`  
**Método:** implementação + revisão estática (sem load test)  
**Nota geral:** **8.0 / 10**

---

## Critérios

| Critério | Antes | Agora | Comentário |
|----------|-------|-------|------------|
| Workers / background | 4.5 | **8.5** | Processo `worker` + compose; API sem BullMQ Worker / PIX interval |
| Cache Redis | 6 | **8** | Perfil (60s) + slots públicos (20s) + invalidate em book/cancel/availability |
| Multi-réplica API | 5 | **8** | HTTP stateless OK; N APIs não multiplicam workers |
| Multi-réplica worker | 3 | **6** | BullMQ OK; PIX `setInterval` ainda N× se escalar worker >1 |
| Queries / hot path slots | 6 | **7.5** | Cache reduz carga; selects gordos em getPublicSlots ainda residuais |
| Pool / infra | 7.5 | **7.5** | Sem mudança |
| Frontend | 6 | **6** | Fora de escopo deste ciclo |
| **Geral** | **6.5** | **8.0** | Grande ganho = worker separado; 10/10 só com multi-worker seguro |

---

## Por que não 10/10

1. **Reconcile PIX sem leader election** — com `replicas > 1` no serviço `worker`, vários timers batem no mesmo `findMany` (idempotente, mas thundering herd).
2. **CRM segment full-scan** e payloads gordos (QR, includes) não tratados neste ciclo.
3. **Redis cache** ainda desabilita permanente após falha (sem reconnect/circuit breaker).
4. Sem métricas de fila / latência p95 sob carga.

---

## Entregas deste ciclo

- `PROCESS_ROLE=all|api|worker` (default `all` — dev single-process intacto)
- Entrypoint `apps/api/src/worker.ts` → `dist/worker.js`
- Compose prod: `api` (`PROCESS_ROLE=api`) + `worker` (`PROCESS_ROLE=worker`)
- PixLifecycle interval **só** com `runsBackgroundJobs`
- BullMQ Worker **só** com `runsBackgroundJobs`; API continua enfileirando
- Cache Redis `getPublicSlots` TTL 20s + invalidate em mutações relevantes

---

## Como rodar o worker

### Local (após build)

```bash
# Terminal 1 — API só HTTP (opcional; default all já inclui background)
# Windows PowerShell:
$env:PROCESS_ROLE='api'; npm run dev:api

# Terminal 2 — worker
npm run build -w @agenda-pro/api
$env:PROCESS_ROLE='worker'; npm run start:worker
```

Dev rápido (tudo no mesmo processo): não sete `PROCESS_ROLE` (default `all`) e use só `npm run dev:api`.

### Docker prod-like

```bash
docker compose -f docker-compose.prod.yml --env-file .env up -d --build
# serviços: postgres, redis, api, worker, web
docker compose -f docker-compose.prod.yml logs -f worker
```

---

## Arquivos tocados

| Arquivo | Papel |
|---------|-------|
| `apps/api/src/worker.ts` | Entrypoint background |
| `apps/api/src/main.ts` | Recusa `PROCESS_ROLE=worker` |
| `apps/api/src/config/env.validation.ts` / `env.service.ts` | `PROCESS_ROLE` |
| `apps/api/src/payments/pix-lifecycle.service.ts` | Interval só no worker/all |
| `apps/api/src/notifications/notifications.service.ts` | Worker só no worker/all |
| `apps/api/src/common/cache/redis-cache.service.ts` | Slots keys + SCAN invalidate |
| `apps/api/src/appointments/appointments.service.ts` | Cache slots (diff mínimo) |
| `apps/api/src/availability/availability.service.ts` | Invalidate slots |
| `apps/api/src/settings/settings.service.ts` | Invalidate slots |
| `apps/api/src/team/team.service.ts` | Invalidate slots |
| `docker-compose.prod.yml` | Serviço `worker` |
| `.env.example` / `package.json` | Docs + scripts |

---

## Veredito

**8.0/10** — worker separado é o maior ganho de escala horizontal da API; cache de slots fecha o hot path de booking. Falta leader election / job único no PIX e hardening Redis para cravar 9–10.
