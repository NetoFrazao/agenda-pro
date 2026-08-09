import { test as base, expect, type APIRequestContext, type Page } from '@playwright/test';

export const E2E_LIVE = process.env.E2E_LIVE === '1';
export const E2E_EMAIL = process.env.E2E_EMAIL ?? 'dono@demo.local';
export const E2E_PASSWORD = process.env.E2E_PASSWORD ?? 'SenhaDemo123!';
export const E2E_TENANT_SLUG = process.env.E2E_TENANT_SLUG ?? 'demo-barbearia';
export const E2E_API_URL = process.env.E2E_API_URL ?? 'http://localhost:3001';

export const test = base.extend({});

/** Chamar no topo do describe (síncrono) — skip antes do browser launch. */
export function skipUnlessLive() {
  test.skip(!E2E_LIVE, 'Defina E2E_LIVE=1 com web+API+seed rodando');
}

export async function stackReachable(request: APIRequestContext): Promise<boolean> {
  try {
    const web = await request.get('/', { timeout: 5_000 });
    if (!web.ok()) return false;
  } catch {
    return false;
  }
  try {
    const api = await request.get(`${E2E_API_URL}/api/health`, { timeout: 5_000 });
    return api.ok();
  } catch {
    return false;
  }
}

export async function assertStackUp(request: APIRequestContext) {
  const up = await stackReachable(request);
  test.skip(
    !up,
    `Stack indisponível (web ${process.env.E2E_BASE_URL ?? 'http://localhost:3000'} / api ${E2E_API_URL})`,
  );
}

export async function loginAsOwner(page: Page) {
  await page.goto('/login');
  await page.getByLabel(/^E-mail$/i).fill(E2E_EMAIL);
  await page.getByLabel(/^Senha$/i).fill(E2E_PASSWORD);
  const slug = page.getByLabel(/Slug do negócio/i);
  if (await slug.isVisible()) {
    await slug.fill(E2E_TENANT_SLUG);
  }
  await page.getByRole('button', { name: /^Entrar$/i }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });
}

export { expect };
