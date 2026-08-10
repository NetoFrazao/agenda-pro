# SCORECARD — UX E-mails, Lembretes & Notificações

**Data:** 2026-08-10  
**Branch:** `cursor/agent-ux-emails`  
**Base:** `cursor/saas-hardening-crm-infra` @ `5fcba31`  
**Escopo:** `apps/api/src/notifications/**` (templates e-mail/WhatsApp) — sem frontend  

---

## Nota deste ciclo

| Item | Antes | Depois |
|------|------:|-------:|
| Tom acolhedor (confirmação/lembrete) | 5 | **8** |
| Terminologia ("agendamento") | 4 | **9** |
| Cancelamento / próximo passo | 5 | **8** |
| Assuntos com abertura | 5 | **8** |

**Nota composta: 8.2 / 10**

Não é 9+: HTML/branding visual do e-mail e templates por vertical (salão vs clínica) ficam fora deste ciclo.

---

## Backlog entregue

### [Alto] Tom acolhedor específico ao serviço
- Confirmação nomeia o serviço e usa abertura acolhedora (“Que bom te receber”).
- Lembretes 24h/2h diferenciam timing (“amanhã” / “daqui a 2 horas”) e fecham com “Estamos te esperando”.

### [Médio] Terminologia consistente
- Substituído “seu horário” / “lembrete do seu horário” por **agendamento** nos fluxos de confirmação, lembrete, cancelamento e waitlist.
- “Horário” permanece só no sentido de slot (“escolha um novo horário”).

### [Médio] Cancelamento com próximo passo
- Corpo em blocos: o que aconteceu → **Próximo passo** com URL de reagendamento → contato com o negócio.

### [Baixo] Assuntos que geram abertura
- Confirmação, lembrete 24h/2h, cancelamento e waitlist com assuntos mais concretos (serviço + urgência/benefício).

---

## Exemplos antes → depois

### Confirmação (e-mail)

| | Antes | Depois |
|---|-------|--------|
| **Assunto** | `Agendamento confirmado — Barbearia` | `Corte confirmado · 11/08/2026, 15:00` |
| **Corpo (trecho)** | `Seu horário está garantido: Corte em …` | `Que bom te receber — seu agendamento de Corte está confirmado para …` |

### Lembrete 24h (e-mail)

| | Antes | Depois |
|---|-------|--------|
| **Assunto** | `Lembrete: Corte em … — Barbearia` | `Amanhã: Corte em Barbearia` |
| **Corpo (trecho)** | `Lembrete do seu horário em Barbearia: Corte em …` | `Passando para lembrar: seu agendamento de Corte em Barbearia é amanhã (…). Estamos te esperando.` |

### Lembrete 2h (e-mail)

| | Antes | Depois |
|---|-------|--------|
| **Assunto** | (mesmo template genérico) | `Daqui a 2h: Corte te espera` |

### Cancelamento (profissional)

| | Antes | Depois |
|---|-------|--------|
| **Assunto** | `Agendamento cancelado — Barbearia` | `Agendamento de Corte cancelado` |
| **Corpo (trecho)** | `… seu horário de Corte … Reagende quando quiser: URL` | `… seu agendamento de Corte …` + bloco **Próximo passo:** escolha um novo horário + URL + “fale com Barbearia” |

### Waitlist

| | Antes | Depois |
|---|-------|--------|
| **Assunto** | `Vaga aberta em Barbearia!` | `Abriu vaga no dia que você pediu · Barbearia` |
| **Corpo (trecho)** | `Abriu um horário … Corre para garantir:` | `abriu uma vaga para agendamento …` + **Próximo passo:** |

---

## Verificação

- `npm run lint -w @agenda-pro/api` — **OK** (0 warnings / 0 errors)
- `npm run test -w @agenda-pro/api -- --testPathPattern=notifications.service.spec` — **OK** (10/10)

---

## Pendências (fora de escopo)

1. Templates HTML (hoje só `text/plain` via nodemailer).
2. Copy por vertical / persona do tenant (salão, clínica, consultório).
3. Remarcação dedicada (`BOOKING_RESCHEDULED`) — não há job type no escopo atual.
4. Assunto de redefinição de senha — já claro; não alterado.
5. Localização de “amanhã” no lembrete 24h vs fuso/calendário do cliente (aproximação de produto).

---

## Arquivos tocados

- `apps/api/src/notifications/notifications.service.ts`
- `apps/api/src/notifications/notifications.service.spec.ts`
- `docs/reviews/SCORECARD_UX_EMAILS.md` (este)
