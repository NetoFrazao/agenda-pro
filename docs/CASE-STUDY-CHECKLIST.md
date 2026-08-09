# Checklist — Case study / portfólio

Use depois que o MVP estiver no ar.

## Problema resolvido
- [ ] Barbeiros/manicures perdem horário com agenda no WhatsApp/papel
- [ ] Falta de presença sem lembrete/sinal
- [ ] Ferramentas genéricas (Calendly) não falam a língua do nicho BR

## Decisões-chave (linkar ADRs)
- [ ] Multi-tenant com `tenantId`
- [ ] UTC no banco + timezone IANA
- [ ] JWT + refresh rotativo
- [ ] Advisory lock anti double-booking
- [ ] BullMQ outbox para e-mail/WhatsApp
- [ ] Preços de plano via env (não hardcoded)

## Desafios técnicos
- [ ] Concorrência no booking
- [ ] Conversão de fuso (slots locais ↔ UTC)
- [ ] Isolamento multi-tenant
- [ ] Filas sem acoplar request HTTP

## Resultado / evidências
- [ ] URL pública do app
- [ ] Print/GIF: cadastro → serviço → booking público
- [ ] Swagger + badge CI
- [ ] Métricas (mesmo que iniciais): tempo para primeiro agendamento, etc.

## Narrativa sugerida (1 parágrafo)
“Construí um mini-SaaS de agendamentos multi-tenant para profissionais de beleza no Brasil, com Next.js/NestJS/Prisma, prevenção de double-booking, filas assíncronas e base de billing/LGPD — do zero ao deploy.”
