# Agenda Pro — DevOps / SRE Review

**Data:** 2026-08-09  
**Agente:** 8 — DevOps/SRE  
**Escopo verificado:** `apps/*/Dockerfile`, `docker-compose.yml`, `docker-compose.prod.yml`, `.github/workflows/ci.yml`, `scripts/backup-postgres.*`, `scripts/restore-postgres.ps1`, health (`apps/api/src/health/*`), `BACKUP.md`, `DISASTER-RECOVERY.md`, `DEPLOYMENT.md`, `docs/DEPLOY.md`, logging Pino em `app.module.ts`  
**Regra:** somente análise; nenhuma alteração de código/infra além deste arquivo.

---

## Nota: **6.5 / 10**

Base sólida para **MVP/beta** (Docker multi-stage, CI amplo, health/ready, runbooks, scripts de backup). Ainda **não é produção paga** em maturidade SRE: sem CD, backup off-host automático, auth Redis, métricas/alertas e drill de restore comprovado.

---

## Resumo executivo

O projeto saiu do estágio “só PG+Redis local” para um pacote ops documentado: imagens non-root, compose prod-like, readiness PG+Redis, CI com migrate/e2e/build e documentação DR. Os maiores buracos são **operacionais**, não de ausência total: deploy ainda manual, dumps locais sem pipeline off-host, observabilidade só logs+health, e alguns defaults/inconsistências de docs que quebram o caminho de release.

---

## Top 5 achados

| # | Gravidade | Achado |
|---|-----------|--------|
| 1 | **ALTO** | Backup/DR documentados, mas RPO 24h **não é garantido** (sem cron, off-host, cifrado, restore drill automatizado) |
| 2 | **ALTO** | Sem CD: CI valida build, mas não publica imagem nem faz deploy reproduzível |
| 3 | **ALTO** | Observabilidade incompleta: Pino + `/health`/`/ready`; sem metrics, Sentry, uptime/alertas |
| 4 | **ALTO** | Compose prod: Redis **sem AUTH**; API/Web publicados em HTTP sem reverse proxy/TLS |
| 5 | **MÉDIO** | CI/docs: imagem Web não buildada no Docker job; `npm audit` soft-fail; comandos `db:migrate -w` inconsistentes |

---

## Pontos fortes (evidência)

| Área | Evidência |
|------|-----------|
| Docker API/Web | Multi-stage, `USER app`, `HEALTHCHECK`, Alpine + `wget` — `apps/api/Dockerfile`, `apps/web/Dockerfile` |
| Compose prod | `depends_on` + `service_healthy`, rede `internal`, Redis AOF + volume — `docker-compose.prod.yml` |
| Health split | Liveness `/api/health`, readiness `/api/health/ready` com **503** — `health.controller.ts` / `health.service.ts` |
| CI | format, lint, unit, e2e, Prisma validate+migrate, build API+Web, docker build API — `.github/workflows/ci.yml` |
| Logs | `nestjs-pino` com `redact` de auth/cookie/password/email/phone/manageToken — `app.module.ts` |
| Backup/DR docs | `BACKUP.md` (RPO/RTO), `DISASTER-RECOVERY.md` (runbooks), scripts dry-run + `-ConfirmRestore` |
| Secrets no git | `.env` gitignored; CI usa JWT dummy só em `env:` do job — não há secrets de produção no workflow |

---

## O que NÃO é problema (neste escopo)

| Afirmação | Evidência |
|-----------|-----------|
| “Health só checa Postgres” (AUDIT antigo) | **Obsoleto.** `ready()` exige PG+Redis; testes em `health.service.spec.ts` |
| “Sem Dockerfile de app” (AUDIT M-11) | **Obsoleto.** Existem Dockerfiles + compose prod |
| “CI sem `next build`” | **Obsoleto.** Step `Build Web (next build)` no `ci.yml` |
| Secrets reais vazando no CI | JWT/DB de teste hardcoded no job — aceitável para CI; sem `secrets.` de prod |
| Postgres exposto no compose prod | PG **não** publica porta; só `api`/`web` — `docker-compose.prod.yml` |

---

## Problemas

### D-01 — Backup sem garantia operacional de RPO

- **Gravidade:** ALTO  
- **Categoria:** DevOps  
- **Localização:** `BACKUP.md`, `scripts/backup-postgres.ps1`, `scripts/backup-postgres.sh`, `scripts/restore-postgres.ps1`  
- **Problema:** Há scripts e RPO≤24h / RTO≤2h **propostos**, mas backup é sob demanda, local (`./backups/`), off-host “manual nesta fase”, sem criptografia at-rest, sem job agendado, sem restore drill no CI/staging. Restore Linux/macOS **não existe** (só `.ps1`).  
- **Impacto:** Em perda de volume/host, RPO real pode ser “desde o último dump que alguém lembrou de fazer e copiou”.  
- **Evidência:** `BACKUP.md` §§ “O que não está coberto”; checklist “Cópia off-host — *manual*”; ausência de `restore-postgres.sh`; nenhum workflow/cron.  
- **Solução:** Cron (host ou provedor) → dump → upload cifrado S3/Backblaze; alerta se arquivo vazio/ausente; restore drill mensal documentado com artefato; portar restore para bash.  
- **Esforço:** Médio  

### D-02 — Sem CD / registry / deploy reproduzível

- **Gravidade:** ALTO  
- **Categoria:** DevOps  
- **Localização:** `.github/workflows/ci.yml`, `DEPLOYMENT.md`, `docs/DEPLOY.md`  
- **Problema:** Pipeline para em validação. Job `docker-api` só `docker build` local no runner (sem push GHCR/Docker Hub). Deploy Vercel/Railway é checklist manual.  
- **Impacto:** Drift entre “o que passou no CI” e “o que está em produção”; rollback de imagem não padronizado; onboarding de release frágil.  
- **Evidência:** Único workflow `CI`; `DEPLOYMENT.md` “Deploy cloud continua manual”; sem `docker push` / `workflow_dispatch` de release.  
- **Solução:** Job release: tag → buildx multi-arch → push registry → deploy (Railway CLI / render / compose SSH) com migrate `deploy` como release step.  
- **Esforço:** Médio  

### D-03 — Observabilidade: logs sim, sinais operacionais não

- **Gravidade:** ALTO  
- **Categoria:** DevOps  
- **Localização:** `apps/api/src/app.module.ts`, `DEPLOYMENT.md` § Observabilidade, `DISASTER-RECOVERY.md`  
- **Problema:** Pino estruturado + redação PII OK. Não há métricas (Prometheus/OTel), APM/Sentry, dashboards de fila BullMQ, nem uptime/alerta configurado no repo. Runbooks dependem de “olhar logs” e health manual.  
- **Impacto:** SEV-1/2 detectados tarde; sem SLO/error budget; falhas de webhook/fila invisíveis até reclamação de tenant.  
- **Evidência:** `DEPLOYMENT.md`: “plano — não instalado full stack”; busca no código sem Sentry/OTel/metrics endpoint.  
- **Solução:** (1) UptimeRobot/Better Stack em `/api/health/ready`; (2) alerta 5xx no provedor; (3) Sentry API+Web; (4) métricas de jobs PENDING/FAILED.  
- **Esforço:** Médio  

### D-04 — Redis e superfície de rede no compose prod inseguros para exposição real

- **Gravidade:** ALTO  
- **Categoria:** DevOps  
- **Localização:** `docker-compose.prod.yml` (`redis` command, `REDIS_URL`, `ports` de api/web)  
- **Problema:** Redis sobe com AOF mas **sem `requirepass`**; URL `redis://redis:6379`. API `:3001` e Web `:3000` publicados direto no host sem TLS/proxy. Defaults `POSTGRES_PASSWORD:-agenda_secret` se `.env` incompleto.  
- **Impacto:** Em host compartilhado / misconfig de firewall, Redis e HTTP plaintext são vetores triviais; JWT defaults fracos se env esquecido.  
- **Evidência:** `command: ['redis-server', '--appendonly', 'yes']` sem senha; `REDIS_URL: redis://redis:6379`; `${POSTGRES_PASSWORD:-agenda_secret}`.  
- **Solução:** Redis AUTH + URL com senha; remover defaults fracos em prod (fail boot se secret default); Traefik/Caddy/nginx com TLS na frente.  
- **Esforço:** Pequeno–Médio  

### D-05 — CI incompleto para artefatos Docker e gate de vulnerabilidades

- **Gravidade:** MÉDIO  
- **Categoria:** DevOps  
- **Localização:** `.github/workflows/ci.yml`  
- **Problema:** `next build` roda no job principal, mas **não** há `docker build -f apps/web/Dockerfile`. `npm audit --audit-level=high` com `continue-on-error: true` não bloqueia merge. Sem scan de imagem (Trivy) nem pin de digest das imagens base.  
- **Impacto:** Dockerfile Web pode quebrar só no deploy compose; highs de deps podem acumular silenciosamente.  
- **Evidência:** Job `docker-api` apenas; step audit L93–95 `continue-on-error: true`.  
- **Solução:** Job `docker-web` paralelo; falhar CI em audit high (ou allowlist explícita); Trivy no build.  
- **Esforço:** Pequeno  

### D-06 — Migrate de release documentado de forma quebrada / não acoplado ao compose

- **Gravidade:** MÉDIO  
- **Categoria:** DevOps  
- **Localização:** `DEPLOYMENT.md`, `docs/DEPLOY.md`, `package.json`, `apps/api/package.json`  
- **Problema:** Docs pedem `npm run db:migrate -w @agenda-pro/api`, mas o script `db:migrate` está na **raiz** (`prisma:migrate` no workspace). Compose prod **não** roda migrate no boot — correto para segurança, mas o caminho de release fica só em checklist e com comando errado.  
- **Impacto:** Deploy “segue o doc” falha; schema antigo sobe com app novo.  
- **Evidência:** `DEPLOYMENT.md` L19; `docs/DEPLOY.md` L39; raiz `db:migrate` → `npm run prisma:migrate -w @agenda-pro/api`; workspace não define `db:migrate`.  
- **Solução:** Corrigir docs para `npm run db:migrate`; release step único (`migrate deploy` antes de traffic); opcional one-shot service no compose.  
- **Esforço:** Pequeno  

### D-07 — Liveness acoplado a Postgres + HEALTHCHECK = readiness

- **Gravidade:** MÉDIO  
- **Categoria:** DevOps  
- **Localização:** `health.service.ts` `check()`, `apps/api/Dockerfile` HEALTHCHECK, `docker-compose.prod.yml` healthcheck api  
- **Problema:** `/api/health` faz `SELECT 1` (não é “process alive only”). Docker/compose marcam unhealthy via `/api/health/ready` (PG+Redis). Queda transitória de Redis/PG → container unhealthy → restart loop possível.  
- **Impacto:** Oscilação de dependência derruba o processo HTTP (e o worker BullMQ no mesmo processo).  
- **Evidência:** `check()` chama `prisma.$queryRaw`; Dockerfile L38–39 e compose L65–66 usam `/ready`.  
- **Solução:** Liveness = processo (ou `/health` sem deps); readiness = PG+Redis só para LB; ajustar Docker HEALTHCHECK para liveness se o orquestrador reinicia em unhealthy.  
- **Esforço:** Pequeno  

### D-08 — Health Redis abre conexão nova a cada probe

- **Gravidade:** MÉDIO  
- **Categoria:** DevOps  
- **Localização:** `apps/api/src/health/health.service.ts` `pingRedis()`  
- **Problema:** Cada check cria `new Redis(...)`, `connect()`, `ping()`, `disconnect()`. Compose/Dockerfile sondam a cada 15s (+ LB externo).  
- **Impacto:** Ruído de conexões, latência de probe, risco de falsos `down` sob pressão.  
- **Evidência:** `pingRedis()` instancia cliente por chamada.  
- **Solução:** Reusar conexão compartilhada (módulo Redis/BullMQ) com timeout curto.  
- **Esforço:** Pequeno  

### D-09 — Sem limites de recurso / sem worker separado (impacto DR)

- **Gravidade:** MÉDIO  
- **Categoria:** DevOps  
- **Localização:** `docker-compose.prod.yml`, `DISASTER-RECOVERY.md` § Worker  
- **Problema:** Compose sem `mem_limit`/`cpus`. Worker BullMQ no mesmo processo da API — OOM ou restart = HTTP + fila juntos (documentado B-13).  
- **Impacto:** Vizinho barulhento no host; blast radius amplo em SEV-2.  
- **Evidência:** Ausência de `deploy.resources` / `mem_limit`; DR: “worker down ≈ API down”.  
- **Solução:** Limits no compose; processo worker separado quando notificações forem críticas.  
- **Esforço:** Médio (worker) / Pequeno (limits)  

### D-10 — Restore PowerShell: encoding / BOM e assimetria de plataforma

- **Gravidade:** BAIXO  
- **Categoria:** DevOps  
- **Localização:** `scripts/backup-postgres.ps1` (`Set-Content -Encoding utf8`), `scripts/restore-postgres.ps1`  
- **Problema:** `Set-Content -Encoding utf8` no Windows PowerShell 5.x frequentemente grava BOM; `psql` pode falhar no primeiro statement. Não há restore shell para Linux CI/staging.  
- **Impacto:** Restore drill falha de forma críptica; RTO estoura.  
- **Evidência:** Backup PS usa `Set-Content`; só `restore-postgres.ps1`.  
- **Solução:** Redirecionar bytes sem BOM (`[IO.File]::WriteAllBytes` / `Out-File -Encoding utf8NoBOM` no PS7) ou `pg_dump -Fc`; script bash de restore.  
- **Esforço:** Pequeno  

### D-11 — Secrets de CI OK, mas sem padrão de secrets de deploy

- **Gravidade:** BAIXO  
- **Categoria:** DevOps  
- **Localização:** `.github/workflows/ci.yml` `env:`, ausência de Environments/OIDC  
- **Problema:** CI não precisa de secrets reais (bom). Também não há GitHub Environments, OIDC para cloud, nem rotação documentada além de “gere no .env”.  
- **Impacto:** Quando CD existir, risco de copiar secrets em plain text no workflow.  
- **Evidência:** JWT `ci-*-secret-min-32-*` no YAML; nenhum `secrets.` / `environment:`.  
- **Solução:** Ao adicionar CD, usar Environments + OIDC; nunca embutir Stripe/JWT prod no YAML.  
- **Esforço:** Pequeno (quando houver CD)  

---

## Matriz rápida por domínio

| Domínio | Nota parcial | Comentário |
|---------|--------------|------------|
| Docker / Compose | 7.5 | Bom prod-like; faltam auth Redis, TLS, limits, migrate release |
| CI | 7.0 | Suíte forte; falta docker web, audit hard gate, scan |
| CD | 3.0 | Manual |
| Health / Ready | 7.5 | Split correto; liveness/deps e conexão Redis a melhorar |
| Logs | 7.5 | Pino + redact; sem agregação central |
| Backup / DR | 5.5 | Docs/scripts bons; execução automática e off-host fracos |
| Secrets | 6.5 | Git ok; defaults compose e Redis fracos |
| Observabilidade | 4.0 | Plano escrito; stack não instalada |

---

## Priorização sugerida (pós-review)

1. **P0:** Backup agendado + off-host cifrado + 1 restore drill documentado  
2. **P0:** Uptime em `/api/health/ready` + alerta 5xx  
3. **P1:** Redis AUTH + remover defaults fracos no compose prod  
4. **P1:** Corrigir docs migrate + release step `migrate deploy`  
5. **P1:** Docker build Web no CI; audit high como gate (ou allowlist)  
6. **P2:** CD com registry + tag imutável  
7. **P2:** Separar liveness/readiness no HEALTHCHECK; reusar Redis no health  
8. **P3:** Sentry/OTel; worker separado; resource limits  

---

## Critério da nota

| Faixa | Critério | Onde estamos |
|-------|----------|--------------|
| 9–10 | CD + backups off-host + alertas + auth deps + drills | — |
| 7–8 | CI+Docker+health+DR docs; gaps operacionais conscientes | **6.5** (borda inferior) |
| 5–6 | Scripts/docs sem execução confiável | parcialmente |
| ≤4 | Só compose dev, sem health/CI sério | superado |

**6.5** = fundação DevOps de portfolio/MVP **acima da média**, ainda **abaixo** do checklist mínimo para tenants pagantes com RPO/RTO contratados.
