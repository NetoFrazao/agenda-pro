# Troubleshooting — Agenda Pro

## Desenvolvimento

| Problema | Causa comum | Solução |
|----------|-------------|---------|
| `ECONNREFUSED` Postgres | Compose down | `npm run docker:up` |
| Prisma P1001 | `DATABASE_URL` errada | Conferir `.env` vs compose |
| Ready 503 | Redis down | Subir Redis; ver `REDIS_URL` |
| Login ok mas dashboard 401 | Cookie/CORS | `CORS_ORIGIN` = URL do Next; mesma “site” localhost |
| Swagger some em prod | Esperado | `SWAGGER_ENABLED=true` só se necessário |
| Upgrade plano 503 | Sem Stripe em prod | Configurar `STRIPE_*` ou aceitar só STARTER |
| PIX não gera | Token MP / plano | `MERCADOPAGO_ACCESS_TOKEN` + entitlement do plano |
| Webhook MP ignorado | Assinatura | `MERCADOPAGO_WEBHOOK_SECRET` |
| Appointments UI vazia | Breaking paginação | API retorna `{ items }`; atualizar cliente |
| E2E falha | DB sujo / migrate | `db:migrate` + Docker healthy |
| Migration orphan | `_prisma_migrations` | Ver `INFRASTRUCTURE-AUDIT.md` |

## Produção

| Problema | Ação |
|----------|------|
| API fora | Ver runbook em `DISASTER-RECOVERY.md` |
| Disco cheio | Logs + backups antigos; alertar |
| Queue acumulada | Redis/Bull; reiniciar API/worker; ver failed jobs |
| Deploy quebrado | Rollback app; **não** rollback migration às cegas |
| Backup falhou | `BACKUP.md`; não operar destrutivo sem backup |

## Contatos de docs

- Segurança: `docs/SECURITY.md`
- API: `docs/API.md`
- Ops: `DEPLOYMENT.md`, `BACKUP.md`, `DISASTER-RECOVERY.md`
