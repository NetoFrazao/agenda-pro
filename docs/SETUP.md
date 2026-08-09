# Setup local — Agenda Pro

## Pré-requisitos

- Node.js **≥ 20**
- npm (workspaces)
- Docker Desktop (PostgreSQL + Redis)
- Git
- (Opcional) GitHub Desktop para push/UI

## 1. Clonar e configurar env

```powershell
cd agenda-pro
Copy-Item .env.example .env
```

Edite `.env` se necessário. Em desenvolvimento, os defaults do exemplo funcionam com `docker compose`.

Documentação completa das variáveis: [ENV.md](./ENV.md).

## 2. Subir Postgres e Redis

```powershell
npm run docker:up
# ou: docker compose up -d
```

Confirme containers `postgres` e `redis` healthy.

## 3. Instalar e migrar

```powershell
npm install
npm run db:generate
npm run db:migrate
npm run prisma:seed -w @agenda-pro/api
```

Conta demo (seed):

| Campo | Valor |
|-------|--------|
| E-mail | `dono@demo.local` |
| Senha | `SenhaDemo123!` |
| Slug | `demo-barbearia` |
| Booking | http://localhost:3000/u/demo-barbearia |

## 4. Rodar API e Web

```powershell
npm run dev:api   # http://localhost:3001  · Swagger /docs
npm run dev:web   # http://localhost:3000
```

Ou bootstrap:

```powershell
./scripts/bootstrap-local.ps1
```

## 5. Qualidade

```powershell
npm run lint
npm run test
npm run test:api
npm run test:e2e -w @agenda-pro/api   # precisa PG + Redis
npm run build
```

## 6. Compose produção-like (opcional)

```powershell
# Preencha JWT/CORS/URLs reais no .env
npm run docker:prod:up
```

Ver [DEPLOYMENT.md](../DEPLOYMENT.md).

## Troubleshooting

| Sintoma | Ação |
|---------|------|
| API não sobe | `DATABASE_URL` / `REDIS_URL` apontando para localhost com compose up |
| `/api/health/ready` → 503 | Redis ou Postgres down |
| Migração falha | `npx prisma migrate status --schema apps/api/prisma/schema.prisma` |
| E2E falha | Docker up + migrate aplicada |
| Cookies auth no browser | `CORS_ORIGIN` = origem do Next; `credentials: true` |

## Branch e GitHub Desktop

Trabalho recente de hardening: branch `cursor/saas-hardening-crm-infra`.

1. Abra o repo no GitHub Desktop (`github .`)
2. Se ainda não houver remote: **Publish repository / Publish branch**
3. Depois: `git remote -v` deve mostrar `origin`
