# ADR 006 — Fase 8: Paridade de mercado (P0 + P1 + P2 parcial)

## Problema

A análise competitiva (vs. ZapCorte, AppBarber, Trinks, Booksy) mostrou que o Agenda Pro
tinha base técnica sólida, mas ficava atrás do padrão de mercado em produto: sem reset de
senha, sem auto-gestão pelo cliente, lembretes que não disparavam de verdade, sem regras
de agenda (antecedência/buffer/grade), sem multi-profissional, sem PIX real, sem relatórios.

## Decisões

### 1. Auto-gestão do cliente via `manageToken` (sem login)

Cada `Appointment` ganha um token único (`manageToken`). O link `/agendamento/{token}`
permite confirmar, cancelar, remarcar e avaliar — padrão Calendly/Booksy.
**Alternativa considerada**: conta de cliente com login. Rejeitada no MVP: fricção alta
para o público (cliente de barbearia não quer criar conta).
**Trade-off**: o token é um bearer secret na URL; mitigado por ser não-enumerável (cuid),
enviado apenas ao próprio cliente, e limitado por prazo de cancelamento (`cancelMinHours`).

### 2. Lembretes com delay real no BullMQ

Jobs de lembrete (24h e 2h antes) agora usam `delay` na fila em vez de disparo imediato.
O worker revalida o status do agendamento antes de enviar (cancelou → não envia).
**Trade-off**: se o Redis for esvaziado, os delays se perdem — o registro em
`notification_jobs.scheduledFor` permite reprocessamento futuro (cron de reconciliação é bônus).

### 3. Regras de agenda por tenant

`minNoticeMinutes`, `maxAdvanceDays`, `bufferMinutes`, `slotGridMinutes`, `cancelMinHours`
no `Tenant`, aplicados no motor de disponibilidade. Grade fixa de 15min por padrão
(mercado) em vez de "grade = duração do serviço". Buffer é aplicado expandindo os
intervalos ocupados nas duas pontas.

### 4. Integrações que degradam graciosamente

- **WhatsApp**: Evolution API (self-hosted, sem custo por mensagem). Sem credenciais,
  o sistema opera em "modo link" (wa.me pré-preenchido no dashboard). Interface única
  (`WhatsAppProvider`) permite trocar por API oficial depois.
- **PIX (sinal)**: Mercado Pago Payments API (QR + copia-e-cola + webhook). Sem
  `MERCADOPAGO_ACCESS_TOKEN`, o sinal vira "combinar no local" e o booking segue normal.
  Idempotência via `X-Idempotency-Key = appointmentId`. Webhook não confia no payload:
  busca o pagamento na API antes de marcar como pago.

### 5. Segurança de sessão: cookies httpOnly

Tokens saíram do `localStorage` (mitigação de XSS). API emite `ap_access`/`ap_refresh`
como cookies httpOnly SameSite=Lax; o guard aceita cookie OU bearer (Swagger/integrações).
Refresh cookie restrito a `/api/auth`. Swagger desligado em produção por padrão.

### 6. Multi-profissional, relatórios e CRM

- Equipe com limite por plano (`PlanDefinition.maxProfessionals`), comissão por
  profissional e soft-delete (preserva histórico).
- Relatórios agregados via `groupBy` do Prisma (receita = COMPLETED; no-show rate =
  noShow / (completed + noShow)).
- CRM light: última visita, total gasto, faltas e pontos de fidelidade por cliente.

### 7. Extras de retenção (P2)

- **Lista de espera**: dia lotado → cliente entra na fila; cancelamento notifica até 5
  em espera (WhatsApp + e-mail).
- **Avaliações**: 1:1 com atendimento COMPLETED, criadas via manage link, moderadas pelo
  dono (`isPublished`), exibidas na página pública com média.
- **Fidelidade**: pontos por real gasto em atendimento concluído (config por tenant).

## Como rodar

```bash
docker compose up -d
npm run db:migrate -w @agenda-pro/api   # aplica 20260809120000_phase8_market_parity
npm run dev:api
npm run dev:web
```

Testes: `npm run test -w @agenda-pro/api` (unit) e `npm run test:e2e -w @agenda-pro/api`
(concorrência real contra Postgres — exige docker compose de pé).

## Perguntas prováveis de entrevista

1. **Como o link de gestão do cliente é seguro sem login?** Token cuid não-enumerável,
   entregue só ao cliente, com ações limitadas por regras de prazo; rate limiting nas rotas.
2. **Por que expandir os intervalos ocupados para o buffer em vez de encolher as janelas?**
   Mantém a semântica "folga entre atendimentos" simétrica e reutiliza o mesmo teste de
   overlap do anti double-booking.
3. **O que acontece se o webhook do Mercado Pago chegar duas vezes?** O handler é
   idempotente: se a cobrança já está PAID, retorna ok sem efeitos; a confirmação usa
   `updateMany` condicionado ao status PENDING_PAYMENT.
4. **Por que cookies httpOnly em vez de localStorage?** JWT em localStorage é legível por
   qualquer script injetado (XSS). Cookie httpOnly não é acessível via JS; SameSite=Lax
   mitiga CSRF nas rotas de mutação (e o browser só envia para o host da API).
5. **Como o lembrete não dispara para agendamento cancelado?** O worker revalida o status
   no banco no momento do processamento, não no momento do enqueue.
