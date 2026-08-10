# SCORECARD Observabilidade — Agenda Pro

**Data:** 2026-08-10  
**Branch:** `cursor/agent-observability-r4`  
**Base:** `cursor/saas-hardening-crm-infra`  
**Agente:** Observabilidade (Round 4 / Agente 4)  
**Nota:** **8.4 / 10**

---

## Veredito

Sentry saiu de stub de env para **SDK real** na API Nest e no Next.js (fail-soft sem DSN). CI ganhou **Trivy** nas imagens Docker e as bases `node:20-alpine` ficaram **pinadas por digest**. CD Web aceita secrets de source maps quando presentes. Ainda não é 10/10: source maps da API, exercise em ambiente real com DSN, e agregação de logs (Pino → SIEM) ficam abertos.

---

## O que mudou neste ciclo

| Item | Prioridade | Status |
|------|------------|--------|
| SDK Sentry API (`instrument` + module + filter) | Médio | **Feito** |
| SDK Sentry Web (instrumentation + global-error + withSentryConfig) | Médio | **Feito** |
| Source maps no CD (Web) | Médio | **Feito** (gated por `SENTRY_AUTH_TOKEN`) |
| Trivy no CI (api/web images) | Baixo | **Feito** |
| Pin digest imagens base | Baixo | **Feito** (`node:20-alpine@sha256:fb4c…`) |
| Docs `SENTRY.md` + `.env.example` | — | **Feito** |

### Escopo / não tocado

- Lógica de negócio (appointments, payments, auth rules).
- Upload de source maps da API Nest (opcional via wizard; não bloqueante).

---

## Matriz

| Domínio | Nota | Comentário |
|---------|------|------------|
| Error tracking (API) | **8.5** | `@sentry/nestjs` + filtro global |
| Error tracking (Web) | **8.5** | client/server/edge + `global-error` |
| Source maps | **7.5** | Web no CD; API ainda sem upload dedicado |
| CI image scan | **8.5** | Trivy CRITICAL/HIGH + ignore-unfixed |
| Supply chain base images | **8.0** | Digest pin multi-arch |
| Fail-soft / DX local | **9.0** | Sem DSN/token = no-op |

---

## Como ativar (resumo)

Ver [`docs/ops/SENTRY.md`](../ops/SENTRY.md): setar `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN`; opcionalmente secrets CD `SENTRY_AUTH_TOKEN` + vars `SENTRY_ORG` / `SENTRY_PROJECT`.

## Relação com DevOps

Atualiza o gap “Sentry SDK / Trivy” do [`SCORECARD_DEVOPS.md`](./SCORECARD_DEVOPS.md) — nota DevOps de observabilidade sobe com este ciclo; scorecard dedicado fica aqui.
