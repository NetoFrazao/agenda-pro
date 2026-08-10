# SCORECARD DevOps — Agenda Pro

**Data:** 2026-08-09  
**Branch:** `cursor/agent-devops`  
**Agente:** DevOps / Infra / Observabilidade  
**Nota:** **8.6 / 10**

---

## Veredito

Ops passou de “CI + compose prod HTTP” para **CD GHCR + migrate no release**, **TLS Caddy**, **backup agendado com alerta**, **restore drill CI**, **audit allowlist dura** e **probe ready com webhook**. Ainda **não é 10/10**: Sentry SDK depende de app code; CD SSH precisa secrets no ambiente real; cifrar dumps / PITR e Trivy/digest pin ficam para o próximo ciclo.

---

## O que mudou neste ciclo

| Item | Prioridade | Status |
|------|------------|--------|
| CD: build → GHCR → deploy + `migrate deploy` | Alto | **Feito** (`.github/workflows/cd.yml`, `scripts/deploy-release.sh`; SSH opcional) |
| Backup off-host agendado + alerta + drill | Alto | **Feito** (cron/Task installers, `backup-scheduled.sh`, alertas, `restore-drill.yml`) |
| TLS na frente api/web (Caddy) | Alto | **Feito** (`docker-compose.tls.yml`, `deploy/Caddyfile`) |
| `npm audit` allowlist versionada (sem soft-fail) | Médio | **Feito** (`ops/npm-audit-allowlist.json`, `scripts/npm-audit-check.mjs`) |
| Sentry mínimo + alerta ready | Médio | **Parcial** — probe Actions + webhook **feito**; Sentry = stub env/docs (`docs/ops/SENTRY.md`); SDK **fora de escopo** (apps) |
| Organizar reviews na raiz → `docs/reviews/` | Baixo | **Feito** |

### Escopo / não tocado

- **Não mexeu** em `apps/api/src` nem `apps/web/src`.
- Sentry SDK: documentada dependência de Engineering/Frontend.

---

## Breaking / avisos (env & deploy)

| Mudança | Impacto |
|---------|---------|
| Overlay TLS (`docker-compose.tls.yml`) | **Breaking:** remove host ports `:3000`/`:3001`; exige Compose ≥ 2.24 (`!reset`) e `TLS_DOMAIN` |
| `API_IMAGE` / `WEB_IMAGE` no prod compose | Override de imagem (default `agenda-pro-*:release`); build local continua |
| CI audit | Soft-fail **removido** — highs fora da allowlist ou allowlist expirada falham o job |
| Novas env | `TLS_DOMAIN`, `CADDY_EMAIL`, `BACKUP_ALERT_WEBHOOK_URL`, `SENTRY_*`, `API_IMAGE`/`WEB_IMAGE` |
| Reviews movidos | Links antigos `./SCORECARD_*.md`, `./AUDIT.md`, etc. na raiz → `docs/reviews/` |

---

## Matriz por domínio

| Domínio | Nota | Comentário |
|---------|------|------------|
| Docker / Compose | **9.0** | Redis AUTH + secrets + worker + TLS overlay |
| CI | **8.5** | Suíte forte + audit gate; sem Trivy ainda |
| CD | **8.0** | GHCR + migrate script; SSH gated por secrets |
| Health / Ready | **8.5** | Probe Actions 15 min + webhook |
| Logs | **7.5** | Pino (app); sem agregação |
| Backup / DR | **8.5** | Cron/Task + off-host + alerta + drill CI |
| Secrets | **8.0** | Prod fail-fast; GHCR via GITHUB_TOKEN |
| Observabilidade | **6.5** | Ready alerts reais; Sentry stub only |

---

## Validação executada (worktree `agenda-pro-devops`)

| Check | Resultado |
|-------|-----------|
| `node scripts/npm-audit-check.mjs` | **OK** (5 highs allowlisted, 0 blockers) |
| `docker compose -f docker-compose.prod.yml --env-file … config` | **exit 0** |
| `docker compose … prod + tls config` | **exit 0** — Caddy `:80`/`:443`; api/web sem publish host |
| `backup-postgres.ps1 -DryRun` / `install-backup-task.ps1 -DryRun` | **OK** |
| `deploy-release.sh --dry-run` / backup+cron+restore `.sh --dry-run` (Git Bash) | **OK** |
| Workflow YAML (`name`/`on`) | **OK** (`ci`, `cd`, `health-probe`, `restore-drill`) |

---

## Blockers para ≥ 9.5 / 10

1. Instalar Sentry SDK em API/Web (outro ownership) + source maps no CD  
2. Trivy/grype no CI + pin de digest nas imagens base  
3. Criptografia at-rest dos dumps + upload S3 nativo  
4. Ambiente `production` GitHub com `DEPLOY_*` + `HEALTH_READY_URL` reais exercitados  
5. Expirar allowlist Next (upgrade major coordenado)

---

## Critério

| Faixa | Critério |
|-------|----------|
| 9–10 | CD exercitado em host real + Sentry live + dumps cifrados + drills rotineiros comprovados |
| 7–8 | CD/TLS/backup/alertas no repo; gaps conscientes ← **aqui (8.6)** |
| 5–6 | Scripts/docs sem execução confiável |
| ≤4 | Só compose dev |

**8.6** = pronto para early adopters self-host com checklist curto; falta fechar observabilidade de app e provar SSH deploy em ambiente real.
