# ADR 004 — Filas BullMQ (Fase 4)

## Problema
Enviar e-mail/WhatsApp não pode travar o POST de agendamento.

## Decisão
Persistir `NotificationJob` no Postgres (outbox) e processar via BullMQ/Redis. Sem SMTP, loga em modo dev. WhatsApp MVP = link `wa.me` no payload.

## Trade-offs
Redis a mais na infra; ganho de resiliência e padrão de mercado.
