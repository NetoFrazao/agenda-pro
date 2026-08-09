# Índice de documentação — Agenda Pro

Última atualização: 2026-08-09 · Branch de referência: `cursor/saas-hardening-crm-infra`

## Começar aqui

| Doc | Quando usar |
|-----|-------------|
| [README](../README.md) | Visão geral, quick start, status |
| [SETUP](./SETUP.md) | Ambiente local completo |
| [ARCHITECTURE](./ARCHITECTURE.md) | Stack, módulos, fluxos |
| [FINAL-AUDIT](../FINAL-AUDIT.md) | O que foi entregue no hardening |

## Operação e produção

| Doc | Conteúdo |
|-----|----------|
| [DEPLOYMENT](../DEPLOYMENT.md) | Topologias, checklist pré-prod, health |
| [DEPLOY](./DEPLOY.md) | Notas de deploy cloud (legado + links) |
| [DATABASE](../DATABASE.md) | Prisma, índices, migrations |
| [BACKUP](../BACKUP.md) | Backup Postgres |
| [DISASTER-RECOVERY](../DISASTER-RECOVERY.md) | RPO/RTO e runbooks |
| [INFRASTRUCTURE-AUDIT](../INFRASTRUCTURE-AUDIT.md) | Auditoria infra/SRE |

## Segurança, produto e qualidade

| Doc | Conteúdo |
|-----|----------|
| [SECURITY](./SECURITY.md) | Auth, RBAC, webhooks, LGPD |
| [API](./API.md) | Contratos HTTP e breaking changes |
| [AUDIT](../AUDIT.md) | Auditoria Fase 1 + status Fases 2–7 |
| [ENV](./ENV.md) | Variáveis de ambiente |
| [TROUBLESHOOTING](./TROUBLESHOOTING.md) | Problemas comuns |

## Coordenação entre áreas

| Doc | Conteúdo |
|-----|----------|
| [DESIGN → ENGINEERING](../DESIGN-ENGINEERING-REQUESTS.md) | Pedidos de UI ao backend |
| [INFRA → ENGINEERING](../INFRA-ENGINEERING-REQUESTS.md) | Pedidos de infra ao backend |

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
| `scripts/start-docker-and-compose.ps1` | Docker + compose |
| `scripts/backup-postgres.ps1` / `.sh` | Backup |
| `scripts/restore-postgres.ps1` | Restore |
