import { clearSessionFlag } from './auth';
import type { ApiErrorBody } from './types';

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/$/, '');

/** Alinhado ao backend (`csrf.constants.ts`) — cookie não-HttpOnly para double-submit. */
export const CSRF_COOKIE = 'ap_csrf';
export const CSRF_HEADER = 'X-CSRF-Token';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Token em memória: necessário em deploy cross-origin (web :3000 → API :3001),
 * onde `document.cookie` não enxerga o cookie setado no domínio da API.
 * Em same-origin (proxy reverso) o cookie legível também funciona.
 */
let csrfTokenMemory: string | null = null;

export class ApiError extends Error {
  status: number;
  body: ApiErrorBody | null;

  constructor(status: number, message: string, body: ApiErrorBody | null = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

type RequestOptions = Omit<RequestInit, 'body' | 'credentials'> & {
  body?: unknown;
  /** Se false, rota pública: 401 não dispara refresh nem redirect. */
  auth?: boolean;
  /** Evita loop infinito no retry de refresh. */
  _retried?: boolean;
  /** Evita loop no retry de CSRF 403. */
  _csrfRetried?: boolean;
};

function messageFromBody(body: ApiErrorBody | null, fallback: string): string {
  if (!body) return fallback;
  if (Array.isArray(body.message)) return body.message.join(', ');
  if (typeof body.message === 'string') return body.message;
  if (body.error) return body.error;
  return fallback;
}

async function parseJsonSafe(res: Response): Promise<ApiErrorBody | null> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as ApiErrorBody;
  } catch {
    return { message: text };
  }
}

function isMutatingMethod(method?: string): boolean {
  return !SAFE_METHODS.has((method || 'GET').toUpperCase());
}

/** Lê `ap_csrf` de document.cookie (só funciona same-origin com a API). */
export function readCsrfCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const parts = document.cookie.split(';');
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed.startsWith(`${CSRF_COOKIE}=`)) continue;
    const raw = trimmed.slice(CSRF_COOKIE.length + 1);
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw || null;
    }
  }
  return null;
}

function getCachedCsrfToken(): string | null {
  return csrfTokenMemory || readCsrfCookie();
}

export function clearCsrfToken(): void {
  csrfTokenMemory = null;
}

/**
 * Garante um token CSRF para mutações cookie-auth.
 * Preferência: memória → cookie legível → GET /api/auth/csrf (body.csrfToken).
 */
export async function ensureCsrfToken(): Promise<string | null> {
  const cached = getCachedCsrfToken();
  if (cached) {
    csrfTokenMemory = cached;
    return cached;
  }
  if (typeof window === 'undefined') return null;

  try {
    const res = await fetch(`${API_BASE}/api/auth/csrf`, {
      method: 'GET',
      credentials: 'include',
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { csrfToken?: string };
    if (data?.csrfToken) {
      csrfTokenMemory = data.csrfToken;
      return csrfTokenMemory;
    }
  } catch {
    return null;
  }
  return getCachedCsrfToken();
}

function isCsrfFailure(status: number, body: ApiErrorBody | null): boolean {
  if (status !== 403) return false;
  const msg = messageFromBody(body, '').toLowerCase();
  return msg.includes('csrf');
}

/** Renova o access token uma vez usando o cookie ap_refresh (body vazio). */
async function tryRefresh(): Promise<boolean> {
  try {
    const headers = new Headers({ 'Content-Type': 'application/json' });
    const csrf = await ensureCsrfToken();
    if (csrf) headers.set(CSRF_HEADER, csrf);

    const res = await fetch(`${API_BASE}/api/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers,
      body: JSON.stringify({}),
    });
    if (!res.ok) return false;

    // Refresh rotaciona `ap_csrf` no Set-Cookie — invalida cache e busca o novo.
    clearCsrfToken();
    await ensureCsrfToken();
    return true;
  } catch {
    return false;
  }
}

/** Sessão expirada de verdade: limpa o flag de UX e volta para o login. */
function handleSessionExpired(): void {
  clearCsrfToken();
  clearSessionFlag();
  if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
    window.location.assign('/login');
  }
}

/**
 * Cliente HTTP da API Agenda Pro.
 * Autentica via cookies httpOnly (credentials: 'include') com um retry
 * transparente após refresh em 401.
 * Mutações cookie-auth enviam `X-CSRF-Token` (double-submit com `ap_csrf`).
 */
export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const {
    body,
    auth = true,
    _retried = false,
    _csrfRetried = false,
    headers,
    ...rest
  } = options;
  const url = path.startsWith('http')
    ? path
    : `${API_BASE}${path.startsWith('/') ? '' : '/'}${path}`;

  const finalHeaders = new Headers(headers);
  if (body !== undefined && !finalHeaders.has('Content-Type')) {
    finalHeaders.set('Content-Type', 'application/json');
  }

  // CSRF: mutações com sessão cookie (auth=true). Público (auth=false) sem ap_access é isento no guard.
  if (auth && isMutatingMethod(rest.method) && !finalHeaders.has(CSRF_HEADER)) {
    const csrf = await ensureCsrfToken();
    if (csrf) finalHeaders.set(CSRF_HEADER, csrf);
  }

  const res = await fetch(url, {
    ...rest,
    credentials: 'include',
    headers: finalHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  // 401 autenticado: tenta refresh uma vez e repete a chamada
  if (res.status === 401 && auth) {
    if (!_retried && (await tryRefresh())) {
      return api<T>(path, { ...options, _retried: true });
    }
    handleSessionExpired();
  }

  // 403 CSRF: renova token via /auth/csrf e tenta uma vez
  if (auth && isMutatingMethod(rest.method) && !_csrfRetried) {
    // Precisa ler o body; clonar lógica via parse — só se status 403
    if (res.status === 403) {
      const errBody = await parseJsonSafe(res);
      if (isCsrfFailure(403, errBody)) {
        clearCsrfToken();
        const fresh = await ensureCsrfToken();
        if (fresh) {
          return api<T>(path, { ...options, _csrfRetried: true });
        }
        throw new ApiError(403, messageFromBody(errBody, 'CSRF token inválido ou ausente'), errBody);
      }
      throw new ApiError(403, messageFromBody(errBody, 'Erro 403'), errBody);
    }
  }

  if (res.status === 204) {
    return undefined as T;
  }

  if (!res.ok) {
    const errBody = await parseJsonSafe(res);
    throw new ApiError(res.status, messageFromBody(errBody, `Erro ${res.status}`), errBody);
  }

  // Logout bem-sucedido: limpa cache CSRF local
  if (auth && (rest.method || 'GET').toUpperCase() === 'POST' && path.includes('/auth/logout')) {
    clearCsrfToken();
  }

  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    return undefined as T;
  }

  return (await res.json()) as T;
}

export function getApiBaseUrl(): string {
  return API_BASE;
}
