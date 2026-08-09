# Perguntas de entrevista — Fase 1

## 1. Por que multi-tenant com `tenantId` em todas as tabelas e não um database por cliente?

**Resposta:** No estágio inicial (centenas/milhares de profissionais), shared database + `tenantId` é mais barato e simples de operar. Isolamento é garantido na aplicação (e depois com RLS se necessário). Database-per-tenant escala em compliance enterprise, mas explode custo operacional cedo demais.

## 2. Por que salvar agendamentos em UTC e disponibilidade em “minutos locais”?

**Resposta:** Instantes absolutos (`startsAt`) precisam de UTC para comparação/concorrência correta. Já a jornada do barbeiro (“trabalho das 9h às 18h”) é civil/local — por isso `startMinute`/`endMinute` + `timezone` IANA. A UI converte na exibição.

## 3. O `@@unique([professionalId, startsAt])` resolve double-booking?

**Resposta:** Só parcialmente (mesmo horário de início). Dois bookings 10:00–10:30 e 10:15–10:45 ainda podem colidir. Na Fase 3 usamos transaction + lock (e/ou `EXCLUDE` com range) para impedir overlap.

## 4. Por que NestJS em vez de Express “puro”?

**Resposta:** Módulos, DI, pipes de validação, Swagger e testing module reduzem código colado e mostram organização de API madura — útil em entrevista e em SaaS que vai crescer (auth, billing, filas).

## 5. O que é um ADR e por que documentar isso no repo?

**Resposta:** Architecture Decision Record: problema, alternativas, decisão e trade-offs. Ajuda o time (e você no futuro) a lembrar o *porquê*, não só o *o quê* — e vira material de case study/portfólio.

## 6. Como o preço do serviço evita divergência com o que o profissional cobra na vida real?

**Resposta:** Não existe preço global. Cada `Service.priceCents` pertence ao `tenantId`. No agendamento gravamos `priceCentsSnapshot` para o histórico não mudar se o profissional alterar o preço depois.

## 7. O que o CI desta fase garante?

**Resposta:** Em todo push/PR: install, Prisma generate/migrate, Prettier, ESLint e testes — com Postgres/Redis de serviço. Quebra cedo antes de misturar auth e booking.
