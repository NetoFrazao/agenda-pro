import {
  DEFAULT_APPOINTMENTS_PAGE_SIZE,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  normalizePage,
  normalizePageSize,
} from './pagination';

describe('pagination helpers', () => {
  it('normalizePage defaults and clamps', () => {
    expect(normalizePage(undefined)).toBe(1);
    expect(normalizePage(0)).toBe(1);
    expect(normalizePage(3.9)).toBe(3);
  });

  it('normalizePageSize respeita teto e fallback', () => {
    expect(normalizePageSize(undefined)).toBe(DEFAULT_PAGE_SIZE);
    expect(normalizePageSize(undefined, DEFAULT_APPOINTMENTS_PAGE_SIZE)).toBe(
      DEFAULT_APPOINTMENTS_PAGE_SIZE,
    );
    expect(normalizePageSize(500)).toBe(MAX_PAGE_SIZE);
    expect(normalizePageSize(0)).toBe(1);
  });
});
