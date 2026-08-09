# SCORECARD DevOps — Agenda Pro

**Data:** 2026-08-09  
**Agente:** DevOps (hardening ops)  
**Nota:** **7.5 / 10**

---

## Veredito

Base ops de MVP/beta **acima da média**: compose prod com Redis AUTH + secrets obrigatórios, worker separado, CI com builds Docker API/Web, health/ready, scripts de backup/watch-ready. **Não é 10/10** — sem CD/registry, sem backup off-host agendado+cifrado comprovado, observabilidade ainda plano + webhook local, `npm audit` soft-fail (Next majors), HTTP sem TLS no compose.

---

## O que mudou neste ciclo

| Item | Status |
|------|--------|
| `docker-compose.prod.yml` Redis `--requirepass` + `REDIS_URL` com senha | Feito |
| Secrets obrigatórios (`${VAR:?…}`) — sem `agenda_secret` / JWT / CORS defaults em prod | Feito |
| Preservado serviço `worker` + `x-api-env` (não revertido) | Feito |
| CI: job `docker-web` paralelo | Feito |
| CI: audit high — soft-fail **documentado** (Next 16 / swagger→js-yaml) | Documentado (não endurecido) |
| `DEPLOYMENT.md` / `.env.example` / `docs/ENV.md` / migrate root | Atualizado |
| Backup / `watch-ready` | **Não tocados** (já existiam) |

### Validação compose

- `docker compose -f docker-compose.prod.yml --env-file <env completo> config` → **exit 0**
- Assert: `requirepass` presente; URL `redis://:…@redis`; sem `agenda_secret`; `PROCESS_ROLE` presente
- Sem `REDIS_PASSWORD` → interpolação falha (`required variable REDIS_PASSWORD…`) **exit 1**

---

## Matriz por domínio

| Domínio | Nota | Comentário |
|---------|------|------------|
| Docker / Compose | **8.5** | AUTH Redis, secrets required, worker; falta TLS/proxy e resource limits |
| CI | **8.0** | Suíte forte + docker API/Web; audit soft consciente; sem Trivy/digest pin |
| CD | **3.0** | Ausente — bloqueia 9–10 |
| Health / Ready | **7.5** | Split OK; HEALTHCHECK ainda = readiness |
| Logs | **7.5** | Pino + redact; sem agregação |
| Backup / DR | **6.0** | Scripts + docs + drill/watch-ready; RPO off-host ainda manual |
| Secrets | **8.0** | Prod compose fail-fast; dev ainda com defaults locais ok |
| Observabilidade | **4.5** | `watch-ready` + plano Sentry/OTel; sem uptime/metrics no repo |

---

## Blockers para ≥ 9 / 10

1. **CD** — buildx → registry (GHCR) → deploy reproduzível + `migrate deploy` no release  
2. **Backup off-host agendado** + alerta de falha + restore drill com artefato periódico  
3. **TLS** na frente de api/web (Caddy/Traefik/nginx) no caminho prod-like  
4. **Audit hard gate** após upgrade Next (postcss/sharp) e/ou allowlist explícita versionada  
5. **Alertas reais** em `/api/health/ready` (SaaS uptime) + Sentry mínimo  

Sem esses, a nota honesta fica na faixa **7–8**.

---

## Critério

| Faixa | Critério |
|-------|----------|
| 9–10 | CD + backups off-host + alertas + auth deps + drills rotineiros |
| 7–8 | CI+Docker+health+DR docs; gaps operacionais conscientes ← **aqui (7.5)** |
| 5–6 | Scripts/docs sem execução confiável |
| ≤4 | Só compose dev |

**7.5** = fundação DevOps sólida para portfolio/early adopters; ainda abaixo do checklist mínimo para tenants pagantes com RPO/RTO contratados e release automatizado.
