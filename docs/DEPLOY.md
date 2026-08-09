# Deploy — Agenda Pro (Fase 6)

> **Atualizado:** o checklist operacional pós-hardening, Docker prod e health/ready estão em [`DEPLOYMENT.md`](../DEPLOYMENT.md).  
> Variáveis: [`ENV.md`](./ENV.md) · Índice: [`DOCUMENTATION.md`](./DOCUMENTATION.md).

## Visão geral

| Parte | Sugestão | Observação |
|-------|----------|------------|
| Web (Next.js) | **Vercel** | Root Directory: `apps/web` |
| API (NestJS) | **Railway** ou **Render** | Root: `apps/api` ou Nixpacks monorepo |
| PostgreSQL | Railway/Render plugin | Use `DATABASE_URL` |
| Redis | Railway/Upstash | Use `REDIS_URL` |

## Variáveis obrigatórias (API)

Copie de `.env.example`. Em produção gere segredos longos:

- `DATABASE_URL`, `REDIS_URL`
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` (≥ 32 chars)
- `CORS_ORIGIN` = URL do frontend (ex: `https://agenda-pro.vercel.app`)
- `APP_PUBLIC_URL`, `API_PUBLIC_URL`
- `PLAN_*_PRICE_CENTS` (placeholders até validar preço)
- Opcional: `STRIPE_*`, `SMTP_*`

## Web (Vercel)

1. Importar o repo GitHub
2. Framework Preset: Next.js
3. Root Directory: `apps/web`
4. Env: `NEXT_PUBLIC_API_URL=https://sua-api.up.railway.app`

## API (Railway)

1. New Project → Deploy from GitHub
2. Add PostgreSQL + Redis
3. Build: `npm install && npx prisma generate --schema apps/api/prisma/schema.prisma && npm run build -w @agenda-pro/api`
4. Start: `npm run start:prod -w @agenda-pro/api`
5. Release / migrate: `npm run db:migrate -w @agenda-pro/api`

> Ajuste os paths se configurar o serviço com root em `apps/api`.

## Checklist pós-deploy

- [ ] `GET /api/health` → ok
- [ ] Swagger `/docs` aberto (ou protegido)
- [ ] Registrar profissional na web
- [ ] Criar serviço + regra de horário
- [ ] Agendar em `/u/seu-slug`
- [ ] Link público no portfólio

## Nota

Credenciais cloud (Vercel/Railway/Stripe) são suas — este repo deixa o caminho pronto; o push das contas é manual.
