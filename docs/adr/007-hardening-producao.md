# ADR 007 — Hardening para produção (segurança, CRM, infra, performance)

- **Status:** Aceito
- **Data:** 2026-08-09
- **Contexto:** Após paridade de mercado (ADR 006), auditoria mostrou gaps para cobrar clientes reais.

## Decisão

Manter a stack (Nest + Next + Prisma + PG + Redis + BullMQ) e endurecer em camadas:

1. **Segurança / multi-tenant / billing fail-closed / PIX lifecycle**
2. **FSM de agenda + waitlist atômica + refresh seguro**
3. **LGPD export/delete + PIX idempotente**
4. **CRM + loyalty ledger**
5. **Design system Graphite (frontend only)**
6. **Infra: Docker, CI, índices, backup/DR, ready**
7. **Performance: paginação, cache perfil, índices CRM**

## Consequências

- Breaking: `GET /api/appointments` → objeto paginado
- Produção exige Stripe real para upgrades; MP webhook secret se PIX
- Redis torna-se dependência de readiness
- Documentação operacional obrigatória (`BACKUP`, `DR`, `DEPLOYMENT`)

## Alternativas rejeitadas

- Trocar stack (custo alto, sem benefício imediato)
- RLS Postgres agora (complexidade prematura)
- Kubernetes agora (sem carga que justifique)

## Referências

- [FINAL-AUDIT.md](../../FINAL-AUDIT.md)
- [AUDIT.md](../../AUDIT.md)
- [ARCHITECTURE.md](../ARCHITECTURE.md)
- [SECURITY.md](../SECURITY.md)
