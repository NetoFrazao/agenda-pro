# ADR 003 — Anti double-booking (Fase 3)

## Problema
Dois clientes podem tentar o mesmo horário ao mesmo tempo.

## Alternativas
1. Só unique em startsAt
2. SELECT FOR UPDATE / advisory lock + recheck overlap
3. Exclusion constraint GiST em tstzrange

## Decisão
MVP: `pg_advisory_xact_lock(hashtext(professionalId))` dentro da transaction + revalidação de overlap + unique `(professionalId, startsAt)`.

## Trade-offs
Simples e eficaz para 1 profissional; GiST é o próximo passo se precisar de overlap puro no índice.
