import { test, expect, skipUnlessLive, assertStackUp, E2E_TENANT_SLUG } from './helpers';

/**
 * Fluxo público: escolher serviço → data → horário → dados → confirmação.
 * Depende de seed com pelo menos 1 serviço ativo e slots futuros.
 */
test.describe('Smoke — criar agendamento público', () => {
  skipUnlessLive();

  test('cliente agenda pelo /u/[slug]', async ({ page, request }) => {
    await assertStackUp(request);

    await page.goto(`/u/${E2E_TENANT_SLUG}`);
    await expect(page.getByText(/Serviço|serviço/i).first()).toBeVisible({ timeout: 20_000 });

    const serviceButton = page.locator('button.surface-elevated, button[class*="surface"]').first();
    await expect(serviceButton).toBeVisible({ timeout: 15_000 });
    await serviceButton.click();

    const anyPro = page.getByText(/Sem preferência|Qualquer profissional/i).first();
    if (await anyPro.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await anyPro.click();
    }

    const dateInput = page.locator('#booking-date');
    if (await dateInput.isVisible({ timeout: 5_000 }).catch(() => false)) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      while ([0, 6].includes(tomorrow.getDay())) tomorrow.setDate(tomorrow.getDate() + 1);
      const ymd = tomorrow.toISOString().slice(0, 10);
      await dateInput.fill(ymd);
    }

    const slotGroup = page.getByRole('group', { name: /Horários disponíveis/i });
    const slotBtn = slotGroup.getByRole('button').first();
    await expect(slotBtn).toBeVisible({ timeout: 20_000 });
    await slotBtn.click();

    const continuar = page.getByRole('button', { name: /Continuar/i });
    if (await continuar.isVisible().catch(() => false)) {
      await continuar.click();
    }

    await page.getByLabel(/Nome completo/i).fill('Cliente E2E Playwright');
    await page.getByLabel(/WhatsApp|telefone/i).fill('11988887777');
    await page.getByRole('button', { name: /Confirmar agendamento/i }).click();

    await expect(page.getByText(/confirmado|agendado|link|PIX|sucesso/i).first()).toBeVisible({
      timeout: 25_000,
    });
  });
});
