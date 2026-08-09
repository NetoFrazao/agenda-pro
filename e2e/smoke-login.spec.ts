import { test, expect, skipUnlessLive, assertStackUp, loginAsOwner } from './helpers';

test.describe('Smoke — login dashboard', () => {
  skipUnlessLive();

  test('dono entra e chega no dashboard', async ({ page, request }) => {
    await assertStackUp(request);
    await loginAsOwner(page);
    await expect(page.getByRole('heading').first()).toBeVisible();
  });
});
