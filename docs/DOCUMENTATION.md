# Índice de documentação — Agenda Pro

Última atualização: 2026-08-09 · Branch: `cursor/agent-devops` (base `cursor/saas-hardening-crm-infra`)

## Começar aqui

| Doc | Quando usar |
|-----|-------------|
| [README](../README.md) | Visão geral, quick start, status |
| [SETUP](./SETUP.md) | Ambiente local completo |
| [ARCHITECTURE](./ARCHITECTURE.md) | Stack, módulos, fluxos |
| [PERFORMANCE](./PERFORMANCE.md) | Worker, PROCESS_ROLE, cache Redis |
| [Reviews / scorecards](./reviews/) | Auditorias e notas por domínio |
| [FINAL-AUDIT](./reviews/FINAL-AUDIT.md) | O que foi entregue no hardening |
| [MEGA CODE REVIEW](./reviews/MEGA_CODE_REVIEW.md) | Consolidação das revisões |

## Operação e produção

| Doc | Conteúdo |
|-----|----------|
| [DEPLOYMENT](../DEPLOYMENT.md) | Topologias, TLS, CD, checklist |
| [DEPLOY](./DEPLOY.md) | Deploy cloud + GHCR |
| [DATABASE](../DATABASE.md) | Prisma, índices, migrations |
| [BACKUP](../BACKUP.md) | Backup agendado + drill |
| [DISASTER-RECOVERY](../DISASTER-RECOVERY.md) | RPO/RTO e runbooks |
| [Sentry stub](./ops/SENTRY.md) | Observabilidade (SDK pendente) |
| [SCORECARD DevOps](./reviews/SCORECARD_DEVOPS.md) | Nota ops |

## Segurança, produto e qualidade

| Doc | Conteúdo |
|-----|----------|
| [SECURITY](./SECURITY.md) | Auth, RBAC, webhooks, LGPD |
| [API](./API.md) | Contratos HTTP e breaking changes |
| [AUDIT](./reviews/AUDIT.md) | Auditoria Fase 1 + status Fases 2–7 |
| [ENV](./ENV.md) | Variáveis de ambiente |
| [TROUBLESHOOTING](./TROUBLESHOOTING.md) | Problemas comuns |

## Coordenação entre áreas

| Doc | Conteúdo |
|-----|----------|
| [DESIGN → ENGINEERING](./reviews/DESIGN-ENGINEERING-REQUESTS.md) | Pedidos de UI ao backend |
| [INFRA → ENGINEERING](./reviews/INFRA-ENGINEERING-REQUESTS.md) | Pedidos de infra ao backend |

## ADRs e histórico de fases

| Doc | Conteúdo |
|-----|----------|
| [ADRs](./adr/) | Decisões arquiteturais |
| [ADR 007 — Hardening](./adr/007-hardening-producao.md) | Segurança, CRM, infra, perf |
| [Fase 0 escopo](./FASE-0-ESCOPO.md) | MVP original |
| [Case study](./CASE-STUDY-CHECKLIST.md) | Checklist de portfólio |
| [Entrevista F1](./ENTREVISTA-FASE-1.md) / [F2–7](./ENTREVISTA-FASES-2-7.md) | Roteiro de entrevista |

## Scripts úteis

| Script | Função |
|--------|--------|
| `scripts/bootstrap-local.ps1` | Sobe stack local |
| `scripts/deploy-release.sh` | Pull GHCR + migrate + up |
| `scripts/backup-scheduled.sh` / `install-backup-cron.sh` | Backup agendado |
| `scripts/install-backup-task.ps1` | Task Scheduler (Windows) |
| `scripts/npm-audit-check.mjs` | Gate audit + allowlist |
| `scripts/watch-ready.ps1` | Probe ready + webhook |
