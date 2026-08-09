import { clearSessionFlag } from './auth';
import type { ApiErrorBody } from './types';

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/$/, '');

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

/** Renova o access token uma vez usando o cookie ap_refresh (body vazio). */
async function tryRefresh(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Sessão expirada de verdade: limpa o flag de UX e volta para o login. */
function handleSessionExpired(): void {
  clearSessionFlag();
  if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
    window.location.assign('/login');
  }
}

/**
 * Cliente HTTP da API Agenda Pro.
 * Autentica via cookies httpOnly (credentials: 'include') com um retry
 * transparente após refresh em 401.
 */
export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, auth = true, _retried = false, headers, ...rest } = options;
  const url = path.startsWith('http')
    ? path
    : `${API_BASE}${path.startsWith('/') ? '' : '/'}${path}`;

  const finalHeaders = new Headers(headers);
  if (body !== undefined && !finalHeaders.has('Content-Type')) {
    finalHeaders.set('Content-Type', 'application/json');
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

  if (res.status === 204) {
    return undefined as T;
  }

  if (!res.ok) {
    const errBody = await parseJsonSafe(res);
    throw new ApiError(res.status, messageFromBody(errBody, `Erro ${res.status}`), errBody);
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
