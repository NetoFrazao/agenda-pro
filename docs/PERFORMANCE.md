# Performance & Escalabilidade — Agenda Pro

Índice operacional. Scorecard honesto: [`SCORECARD_PERFORMANCE_SCALE.md`](../SCORECARD_PERFORMANCE_SCALE.md).  
Review estática anterior: [`PERFORMANCE_REVIEW.md`](../PERFORMANCE_REVIEW.md).

## Modelo de processos

| `PROCESS_ROLE` | HTTP | BullMQ Worker | PIX reconcile (`setInterval`) | Uso |
|----------------|------|---------------|-------------------------------|-----|
| `all` (default) | sim | sim | sim | Dev / single-process |
| `api` | sim | não (só Queue) | não | Compose prod / multi-réplica API |
| `worker` | não | sim | sim | Compose `worker` / `npm run start:worker` |

- Webhooks PIX e `confirmPaid` / `releasePendingPayment` **continuam na API** (handlers HTTP).
- O **timer** de reconcile roda apenas onde `runsBackgroundJobs === true`.

## Cache Redis (leitura curta)

| Chave | TTL | Invalidate |
|-------|-----|------------|
| `cache:public:profile:{slug}` | 60s | settings / services / team / reviews |
| `cache:public:slots:{slug}:{serviceId}:{date}:{pro\|_}` | 20s | book / cancel / reschedule / availability / booking settings |

Degrade: Redis down → no-op (app segue no Postgres). Booking sempre revalida slot com advisory lock.

## Worker

```bash
npm run build -w @agenda-pro/api
PROCESS_ROLE=worker npm run start:worker
# Compose:
docker compose -f docker-compose.prod.yml --env-file .env up -d worker
```

**Atenção:** preferir **1 réplica** de worker até existir leader election no reconcile PIX (BullMQ já é seguro com N consumers).
