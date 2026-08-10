import { ApiError } from './api';

/** Erros por campo nos forms de auth (`Field error=`). */
export type AuthFieldErrors = Record<string, string>;

function messagesFromApi(err: ApiError): string[] {
  const raw = err.body?.message;
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === 'string' && raw.trim()) return [raw];
  if (err.message) return [err.message];
  return [];
}

/**
 * Mapeia mensagens Nest/class-validator (e 401 de login) para chaves de Field.
 * Retorna `{}` se não houver campo alvo claro — o caller mantém Alert de página.
 */
export function mapAuthApiFieldErrors(
  err: ApiError,
  fields: readonly string[],
): AuthFieldErrors {
  const allowed = new Set(fields);
  const next: AuthFieldErrors = {};

  if (err.status === 401 && allowed.has('password')) {
    next.password = 'E-mail ou senha incorretos.';
    return next;
  }

  for (const msg of messagesFromApi(err)) {
    const lower = msg.toLowerCase();
    for (const field of fields) {
      if (!allowed.has(field)) continue;
      if (lower.includes(field.toLowerCase())) {
        next[field] = msg;
        break;
      }
      if (field === 'tenantSlug' && (lower.includes('tenant') || lower.includes('slug'))) {
        next[field] = msg;
        break;
      }
      if (field === 'businessName' && lower.includes('business')) {
        next[field] = msg;
        break;
      }
      if (field === 'confirm' && (lower.includes('confirm') || lower.includes('coincid'))) {
        next[field] = msg;
        break;
      }
    }
  }

  return next;
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function isValidTenantSlug(value: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.trim().toLowerCase());
}
