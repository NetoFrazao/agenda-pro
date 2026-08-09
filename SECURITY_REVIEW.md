# SECURITY_REVIEW — Agenda Pro (OWASP)

| Campo | Valor |
|-------|--------|
| **Data** | 2026-08-09 |
| **Escopo** | API Nest (`apps/api`), Web Next (`apps/web`), auth/sessão, webhooks, multi-tenant, LGPD |
| **Método** | Revisão adversarial estática (código + schema + env presence); **sem alteração de código** |
| **Nota geral** | **5.5 / 10** |
| **Veredito** | Base sólida (cookies httpOnly, refresh com reuse detection, tenant scoping, webhooks assinados, helmet, ValidationPipe), mas há **bypass de pagamento PIX** explorável pelo cliente e gaps de capability-URL / step-up em ações destrutivas. |

Critérios da nota: 10 = produção financeiramente crítica sem achados Alto/Crítico; cada Crítico −1.5; cada Alto −0.7; Médios acumulados −0.3. Fundações boas impedem nota &lt; 4.

---

## Top 5 (resumo executivo)

1. **Crítico — Bypass de sinal PIX** via `confirmByToken` / FSM `PENDING_PAYMENT → CONFIRMED` sem `PixCharge.PAID`
2. **Alto — `manageToken` = `cuid()` em claro no DB** (entropia fraca vs refresh; vazamento de DB = takeover de todos os links)
3. **Alto — `DELETE /api/account` sem step-up** (senha / reauth); sessão roubada = wipe LGPD total
4. **Alto — Throttling só in-memory** + `POST /auth/register` sem `@Throttle` dedicado (spam de tenants / bypass multi-réplica)
5. **Médio/Alto — BAC intra-tenant**: `MEMBER` lê/altera CRM completo e pode forçar status pós-PIX; CSRF só `SameSite=Lax`

---

## Inventário rápido de controles (evidência positiva)

| Controle | Evidência |
|----------|-----------|
| Cookies httpOnly + SameSite=Lax + Secure em prod | `apps/api/src/auth/auth.controller.ts` (`setAuthCookies`) |
| JWT **não** no body de login/register | mesmo arquivo — retorna só `{ user, tenant }` |
| Refresh com rotação atômica + revoke-on-reuse | `apps/api/src/auth/auth.service.ts` `refresh()` |
| JWT validate contra DB (`isActive`, `deletedAt`, tenant) | `apps/api/src/auth/jwt.strategy.ts` |
| Tenant nas queries de domínio + e2e cross-tenant | services/clients/appointments + `apps/api/test/booking.e2e-spec.ts` |
| Helmet + CORS credentials + ValidationPipe whitelist | `apps/api/src/main.ts` |
| Stripe `constructEvent` + MP HMAC `timingSafeEqual` | `billing.service.ts`, `mercadopago.service.ts` |
| PIX webhook idempotente | `pix-lifecycle.service.ts` `confirmPaid` |
| LGPD export/delete + anonimização | `account.service.ts` |
| Pino redact de auth/cookie/password | `app.module.ts` |
| `.env` no `.gitignore`; secrets **não** commitados | `git ls-files` só `*.env.example` |

### Secrets no workspace (presença apenas — valores não expostos)

| Variável / arquivo | Status |
|--------------------|--------|
| `.env` (raiz) | **Presente** (gitignored) |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | **Presente** |
| `DATABASE_URL` / `REDIS_URL` / `POSTGRES_*` | **Presente** |
| `STRIPE_*` / `MERCADOPAGO_*` / `SMTP_USER`/`PASS` / `EVOLUTION_*` | **Ausente** (vazio) |
| `apps/web/.env.local` | **Presente** (`NEXT_PUBLIC_API_URL` presente) |
| Secrets em git | **Ausente** |

---

## Problemas (críticos primeiro)

### SEC-01 — Bypass de pagamento PIX pelo link do cliente

| | |
|--|--|
| **Categoria** | Segurança — Broken Access / Business Logic |
| **Severidade** | **Crítico** |
| **OWASP** | A01 Broken Access Control / A04 Insecure Design |

**Problema.** Agendamento com sinal online nasce como `PENDING_PAYMENT`. O cliente recebe `manageUrl` no response de `POST /api/public/:slug/book` e pode chamar `POST /api/public/appointments/:token/confirm`, que aplica `PENDING_PAYMENT → CONFIRMED` **sem** verificar `PixCharge.status === PAID`.

**Evidência.**

```719:729:apps/api/src/appointments/appointments.service.ts
  async confirmByToken(token: string) {
    const appointment = await this.findByManageToken(token);
    if (appointment.status === AppointmentStatus.CONFIRMED) {
      return { ok: true, status: appointment.status };
    }
    assertValidTransition(appointment.status, AppointmentStatus.CONFIRMED);
    await this.prisma.appointment.update({
      where: { id: appointment.id },
      data: { status: AppointmentStatus.CONFIRMED },
    });
```

```8:13:apps/api/src/appointments/appointment-state.ts
  [AppointmentStatus.PENDING_PAYMENT]: [
    AppointmentStatus.CONFIRMED,
    AppointmentStatus.SCHEDULED,
    AppointmentStatus.CANCELLED,
  ],
```

O caminho legítimo de pagamento (`PixLifecycleService.confirmPaid`) marca charge + appointment atomicamente; o confirm público **contorna** isso. O dashboard `PATCH /appointments/:id/status` também permite a mesma transição (MEMBER/OWNER).

**Exploração.** Book com depósito PIX → usar `manageUrl` → `confirm` → slot confirmado sem pagar; charge pode permanecer `PENDING` até expirar/reconciliar (estado inconsistente).

**Mitigação sugerida.** Bloquear `confirmByToken` (e, se desejado, mutações de staff) enquanto `status === PENDING_PAYMENT` e charge ≠ `PAID`; só webhook/`confirmPaid` promove para `CONFIRMED`.

---

### SEC-02 — Capability URL fraca: `manageToken` = `cuid()` em plaintext

| | |
|--|--|
| **Categoria** | Segurança — Tokens / IDOR-by-guess / Secrets |
| **Severidade** | **Alto** |
| **OWASP** | A01 / A02 Cryptographic Failures |

**Problema.** O token que autentica o cliente (cancelar, remarcar, ver PIX QR/`copyPaste`, avaliar) é `@default(cuid())` e armazenado **em claro**. Refresh/reset usam `randomBytes(48)` + SHA-256; o manage link não.

**Evidência.**

```303:304:apps/api/prisma/schema.prisma
  /// Token secreto do link de auto-gestão do cliente (confirmar/cancelar/remarcar)
  manageToken    String            @unique @default(cuid())
```

```7:8:apps/api/src/common/crypto/tokens.ts
export function generateRefreshToken(): string {
  return randomBytes(48).toString('base64url');
}
```

`getByManageToken` expõe `pixCharge.copyPaste` / `qrCodeBase64` a quem possui o token (`appointments.service.ts` ~674–711). Dump de DB ou vazamento de logs/backups = compromisso em massa dos links. CUID não é projetado como segredo de capability URL.

**Mitigação sugerida.** Gerar com `randomBytes` (igual refresh); persistir só hash; lookup por hash; rotacionar após uso sensível se aplicável.

---

### SEC-03 — Exclusão LGPD / export sem step-up authentication

| | |
|--|--|
| **Categoria** | Segurança — Sessão / LGPD |
| **Severidade** | **Alto** |
| **OWASP** | A01 / A07 Identification & Authentication Failures |

**Problema.** `DELETE /api/account` e `GET /api/account/export` exigem apenas JWT OWNER (cookie). Não há reintrodução de senha, challenge, nem confirmação out-of-band. Cookie `ap_access` com `path: '/'` e TTL do access token.

**Evidência.** `account.controller.ts` — `@Roles(UserRole.OWNER)` sem segundo fator; `account.service.ts` `deleteAccount` anonimiza users/clients, revoga tokens, cancela Stripe.

**Exploração.** XSS em origem da API improvável para ler httpOnly; porém roubo de sessão (malware, PC compartilhado, extensão) ou CSRF em cenários onde SameSite falha (browser antigo / misconfig) → wipe irreversível + export de todo o CRM.

**Mitigação sugerida.** Exigir `password` (ou magic link) no body de delete/export; rate limit estrito; audit log imutável.

---

### SEC-04 — Rate limit frágil + register sem throttle dedicado

| | |
|--|--|
| **Categoria** | Segurança — Rate limiting / Abuse |
| **Severidade** | **Alto** |
| **OWASP** | A04 / A05 Security Misconfiguration |

**Problema.**

1. `ThrottlerModule` global **sem storage Redis** → contadores in-memory por processo; N réplicas = N× limite.
2. `POST /auth/login` e forgot/reset têm `@Throttle` dedicado; **`POST /auth/register` não**.
3. Webhooks Stripe sem `@Throttle` dedicado (só global).

**Evidência.** `app.module.ts` `ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }])`; `auth.controller.ts` — `register` sem `@Throttle`, `login` com `limit: 10`.

**Exploração.** Automação cria milhares de tenants/users; dilui rate limit em horizontal scaling; brute force distribuído.

**Mitigação sugerida.** Storage Redis para Throttler; `@Throttle` agressivo em register; CAPTCHA/e-mail verify em produção.

---

### SEC-05 — BAC intra-tenant: MEMBER com CRM completo + mutação de status pós-sinal

| | |
|--|--|
| **Categoria** | Segurança — Broken Access Control |
| **Severidade** | **Alto** (insider) / Médio se MEMBER for “só agenda” |
| **OWASP** | A01 |

**Problema.** `RolesGuard` só restringe rotas com `@Roles`. `ClientsController` e `AppointmentsController` usam só `JwtAuthGuard` — qualquer `MEMBER` lista telefone/e-mail/notas, altera consent LGPD, e `updateStatus` pode `PENDING_PAYMENT → CONFIRMED/SCHEDULED` (bypass de sinal pelo staff).

**Evidência.** `clients.controller.ts` L103–104; `appointments.controller.ts` L10; waitlist `GET` sem `@Roles` (`waitlist.controller.ts`). Docs já admitem RBAC fino pendente (`docs/SECURITY.md`).

**Mitigação sugerida.** Papéis (RECEPCIONISTA vs OWNER); bloquear promoção de `PENDING_PAYMENT` sem charge paga; OWNER-only para consent/export notes sensíveis.

---

### SEC-06 — CSRF: dependência exclusiva de SameSite

| | |
|--|--|
| **Categoria** | Segurança — CSRF |
| **Severidade** | **Médio** |
| **OWASP** | A01 |

**Problema.** Auth state-changing via cookies (`credentials: 'include'`). Não há CSRF token / double-submit. Mitigação = `sameSite: 'lax'` + CORS `origin: env.corsOrigin`. Documentado como pendência em `docs/SECURITY.md`.

**Evidência.** `auth.controller.ts` cookies; `apps/web/src/lib/api.ts` sempre `credentials: 'include'`.

**Risco residual.** Browsers legados; se `CORS_ORIGIN` for amplo demais; integrações mobile WebView. `SameSite=Lax` bloqueia POST cross-site clássico na maioria dos browsers modernos — risco residual, não explotação trivial.

**Mitigação sugerida.** Token CSRF em cookie + header para mutações; ou `SameSite=strict` no refresh.

---

### SEC-07 — Headers de segurança incompletos no frontend Next

| | |
|--|--|
| **Categoria** | Segurança — XSS / Headers |
| **Severidade** | **Médio** |
| **OWASP** | A03 / A05 |

**Problema.** API usa `helmet()`. `apps/web/next.config.ts` não define CSP, HSTS, `X-Frame-Options`, `Referrer-Policy`. Reviews/`about` renderizam texto via React (escape default — **sem** `dangerouslySetInnerHTML` encontrado), o que mitiga XSS armazenado, mas falta defense-in-depth.

**Evidência.** `main.ts` `app.use(helmet())`; `next.config.ts` só `reactStrictMode` + `output: 'standalone'`.

**Mitigação sugerida.** Headers no Next (`headers()` async) com CSP estrita; `Referrer-Policy: no-referrer` em páginas `/agendamento/[token]` para não vazar token em Referer.

---

### SEC-08 — `manageUrl` / token em Referer e UI copiável

| | |
|--|--|
| **Categoria** | Segurança — Tokens / PII |
| **Severidade** | **Médio** |
| **OWASP** | A01 / A02 |

**Problema.** Book devolve `manageUrl` com token na path; UI pública oferece link + “Copiar link” (`apps/web/src/app/u/[slug]/page.tsx`). Path tokens vazam via Referer, histórico, screenshots, analytics de terceiros.

**Mitigação sugerida.** Token só em fragmento `#` ou cookie one-time; `Referrer-Policy`; não logar URL completa.

---

### SEC-09 — Política de senha fraca + `JWT_REFRESH_SECRET` morto

| | |
|--|--|
| **Categoria** | Segurança — Auth / Secrets |
| **Severidade** | **Médio** / Baixo |
| **OWASP** | A07 / A02 |

**Problema.**

- Senha: só `@MinLength(8)` / `@MaxLength(72)` — sem complexidade (`auth.dto.ts`).
- `JWT_REFRESH_SECRET` é **obrigatório** no Zod (`env.validation.ts`) e exposto em `EnvService`, mas refresh é opaco hasheado — **nunca usado para assinar**. Falsa sensação de segurança / config morta.

**Mitigação sugerida.** Política de senha + breach check opcional; remover ou usar o secret (ex.: HMAC extra), documentar modelo opaco.

---

### SEC-10 — Stripe webhook: fallback de `rawBody`

| | |
|--|--|
| **Categoria** | Segurança — Webhooks |
| **Severidade** | **Médio** (misconfig) |
| **OWASP** | A08 Software & Data Integrity |

**Problema.**

```49:50:apps/api/src/billing/billing.controller.ts
    const raw = req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));
    return this.billing.handleStripeWebhook(raw, signature);
```

Se `rawBody` falhar silenciosamente, `JSON.stringify(req.body)` **não** reproduz bytes originais → assinatura falha (fail-closed). Porém mascara misconfig operacional; melhor falhar explícito sem fallback.

MP: assinatura inválida ainda responde `{ ok: true }` (anti-retry) — dificulta detecção; aceitável se houver métricas/alertas no `logger.warn`.

---

### SEC-11 — LGPD: titular cliente final sem self-service; overwrite de PII no book

| | |
|--|--|
| **Categoria** | Segurança / Privacidade — LGPD |
| **Severidade** | **Médio** |
| **OWASP** | A01 / compliance |

**Problemas.**

1. Export/delete são do **OWNER do tenant**, não do cliente final. Política (`privacidade/page.tsx`) manda cliente pedir ao estabelecimento — ok juridicamente se DPA claro, frágil na prática.
2. `bookPublic` com telefone existente **sobrescreve** `name` e pode atualizar `email` (`appointments.service.ts` ~492–498) — poluição / sequestro cosmético de ficha CRM conhecendo o telefone.
3. `NotificationJob.payload` guarda e-mail/telefone em JSON até delete da conta; delete limpa jobs (`account.service.ts`).

**Mitigação sugerida.** Não sobrescrever PII sem prova; fluxo de correção; retenção/TTL em payloads de notificação.

---

### SEC-12 — Dependências: `npm audit` soft-fail no CI

| | |
|--|--|
| **Categoria** | Segurança — Supply chain |
| **Severidade** | **Médio** |
| **OWASP** | A06 Vulnerable Components |

**Evidência.** `.github/workflows/ci.yml` — `npm audit --audit-level=high` com `continue-on-error: true`. Highs conhecidos podem ir para prod sem gate.

---

### SEC-13 — Defense-in-depth: reports `service.findMany` sem `tenantId`

| | |
|--|--|
| **Categoria** | Segurança — IDOR (latente) |
| **Severidade** | **Baixo** |
| **OWASP** | A01 |

**Evidência.** `reports.service.ts` L73–75: `where: { id: { in: serviceIds } }` — IDs vêm de `groupBy` já filtrado por `tenantId`. Sem isolamento explícito no segundo query (padrão frágil se refatorado).

---

## Matriz OWASP (resumo)

| Área | Status | Nota |
|------|--------|------|
| BAC / IDOR cross-tenant | Bom (queries + e2e) | — |
| BAC / payment & MEMBER | **Falha crítica/alta** | SEC-01, SEC-05 |
| XSS | Bom (React escape; tokens fora do body) | SEC-07 residual |
| CSRF | Parcial (SameSite only) | SEC-06 |
| Injection | Bom (Prisma; `$queryRaw` só `SELECT 1`) | — |
| Secrets | Bom em git; JWT refresh secret morto | SEC-09; env local presente |
| Tokens / sessions | Bom refresh; manageToken fraco | SEC-02, SEC-08 |
| Webhooks | Bom MP/Stripe verify; rawBody fallback | SEC-10 |
| Rate limit | Parcial | SEC-04 |
| Headers | API OK; Web fraco | SEC-07 |
| PII / LGPD | Export/delete OWNER OK; gaps cliente | SEC-03, SEC-11 |

---

## Pontuação detalhada

| Dimensão | Score 0–10 | Comentário |
|----------|------------|------------|
| AuthN / sessão | 7.5 | Cookies + refresh reuse detection |
| AuthZ / multi-tenant | 6.0 | Cross-tenant OK; intra-tenant e PIX fracos |
| Pagamentos / webhooks | 4.0 | Verify OK; **confirm público anula PIX** |
| Abuse / rate limit | 5.0 | Throttle pontual; storage frágil |
| LGPD / PII | 6.5 | Export/delete sólidos; step-up e cliente final |
| Hardening / headers / deps | 6.0 | Helmet; Next CSP ausente; audit soft |

**Nota final: 5.5 / 10** — não publicar cobrança PIX em produção até fechar SEC-01; priorizar SEC-02 e SEC-03 em seguida.

---

## Checklist de remediação (ordem)

1. [ ] Impedir confirmação/agenda de `PENDING_PAYMENT` sem `PixCharge.PAID` (público + API interna)
2. [ ] Trocar `manageToken` para segredo alto-entropia + hash at rest
3. [ ] Step-up password em `DELETE/GET export` account
4. [ ] Throttler Redis + throttle em `register`
5. [ ] RBAC fino / restringir MEMBER em CRM e status financeiro
6. [ ] CSP + Referrer-Policy no Next; CSRF token se cookie cross-site expandir
7. [ ] Gate CI em `npm audit` high (ou allowlist explícita)
8. [ ] Remover fallback `JSON.stringify` do webhook Stripe; alertar assinatura MP inválida

---

*Agente 5 — Segurança OWASP. Apenas este arquivo foi escrito; nenhum código de aplicação foi alterado.*
