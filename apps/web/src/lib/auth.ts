/**
 * Sessão baseada em cookies httpOnly (`ap_access`/`ap_refresh`) emitidos pela API.
 * O browser envia os cookies automaticamente (fetch com credentials: 'include');
 * aqui guardamos apenas um flag leve de UX em localStorage para saber se vale a
 * pena renderizar áreas autenticadas. A autoridade real é o cookie: se uma chamada
 * autenticada falhar com 401 mesmo após refresh, o flag é limpo em lib/api.ts.
 */

const SESSION_FLAG_KEY = 'agenda_pro_session';

export function setSessionFlag(): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(SESSION_FLAG_KEY, '1');
}

export function clearSessionFlag(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(SESSION_FLAG_KEY);
}

export function hasSession(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(SESSION_FLAG_KEY) === '1';
}
