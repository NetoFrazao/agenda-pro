/** Teto padrão de pageSize em listagens autenticadas. */
export const DEFAULT_PAGE_SIZE = 20;
export const DEFAULT_APPOINTMENTS_PAGE_SIZE = 100;
export const MAX_PAGE_SIZE = 100;

export function normalizePage(page?: number): number {
  if (page === undefined || page === null || Number.isNaN(page)) return 1;
  return Math.max(1, Math.floor(page));
}

export function normalizePageSize(
  pageSize?: number,
  fallback = DEFAULT_PAGE_SIZE,
  max = MAX_PAGE_SIZE,
): number {
  if (pageSize === undefined || pageSize === null || Number.isNaN(pageSize)) return fallback;
  return Math.min(max, Math.max(1, Math.floor(pageSize)));
}

export type PageResult<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};
