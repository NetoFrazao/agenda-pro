# ADR 002 — Autenticação JWT (Fase 2)

## Problema
Profissionais precisam de login seguro no dashboard, separado da página pública de agendamento.

## Alternativas
1. Session cookies server-side
2. Auth0/Clerk
3. JWT access + refresh próprio

## Decisão
JWT access curto (15m) + refresh opaco hasheado no banco, com rotação no `/auth/refresh`.

## Trade-offs
Controle total e bom para entrevista; exige cuidado com XSS (tokens no localStorage no MVP web — evoluir para httpOnly cookies depois).
