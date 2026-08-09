# Perguntas de entrevista — Fases 2–7

## Auth (Fase 2)
**Por que refresh token hasheado no banco?** Se o DB vazar, o token cru não serve; permite revogação e rotação.

**Access 15m + refresh 7d — por quê?** Minimiza janela se o access vazar; UX continua logada via refresh.

## Disponibilidade (Fase 3)
**Como evita double-booking?** Transaction + `pg_advisory_xact_lock` + recheck de overlap + unique `(professionalId, startsAt)`.

**Por que minutos locais nas regras?** O barbeiro pensa “9h–18h”, não em UTC.

## Filas (Fase 4)
**Por que não enviar e-mail no request?** Latência/ falha de SMTP não deve quebrar o booking; outbox + worker.

**WhatsApp sem API oficial?** MVP gera `wa.me`; upgrade depois para Evolution/Twilio.

## Frontend (Fase 5)
**Dashboard vs página pública?** Auth JWT no dashboard; booking público rate-limited sem login.

## Deploy (Fase 6)
**Separar web e API?** Escala e deploys independentes (Vercel + Railway) — padrão SaaS.

## Billing / LGPD (Fase 7)
**Por que preço no env?** Validar com clientes reais antes de travar preço no código.

**O que a exclusão LGPD apaga?** Tenant, users, clients, appointments, services, tokens — dados pessoais do titular/operação.
