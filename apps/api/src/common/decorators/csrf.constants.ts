/** Cookie legível pelo JS do frontend (double-submit). */
export const CSRF_COOKIE = 'ap_csrf';

/** Header que o SPA deve espelhar a partir do cookie. */
export const CSRF_HEADER = 'x-csrf-token';
