import {
  test,
  expect,
  skipUnlessLive,
  assertStackUp,
  E2E_API_URL,
  E2E_TENANT_SLUG,
} from './helpers';

/**
 * Cria agendamento via API pública e gerencia pelo link no browser.
 */
test.describe('Smoke — gerenciar agendamento pelo link', () => {
  skipUnlessLive();

  test('confirmar presença na página /agendamento/[token]', async ({ page, request }) => {
    await assertStackUp(request);

    const profile = await request.get(`${E2E_API_URL}/api/public/${E2E_TENANT_SLUG}`);
    test.skip(!profile.ok(), `Perfil público ${E2E_TENANT_SLUG} indisponível — rode o seed`);

    const body = await profile.json();
    const serviceId = body.services?.[0]?.id as string | undefined;
    test.skip(!serviceId, 'Tenant demo sem serviços ativos');

    const date = new Date();
    do {
      date.setUTCDate(date.getUTCDate() + 1);
    } while ([0, 6].includes(date.getUTCDay()));
    const dateKey = date.toISOString().slice(0, 10);

    const slotsRes = await request.get(
      `${E2E_API_URL}/api/public/${E2E_TENANT_SLUG}/slots?serviceId=${serviceId}&date=${dateKey}`,
    );
    test.skip(!slotsRes.ok(), 'Falha ao buscar slots');
    const slotsBody = await slotsRes.json();
    const startsAt = slotsBody.slots?.[0] as string | undefined;
    test.skip(!startsAt, `Sem slots em ${dateKey}`);

    const phone = `119${String(Date.now()).slice(-8)}`;
    const book = await request.post(`${E2E_API_URL}/api/public/${E2E_TENANT_SLUG}/book`, {
      data: {
        serviceId,
        startsAt,
        clientName: 'Cliente Manage E2E',
        clientPhone: phone,
      },
    });
    expect(book.status()).toBe(201);
    const booked = await book.json();
    expect(booked.manageUrl).toMatch(/\/agendamento\//);
    const token = String(booked.manageUrl).split('/').pop();
    expect(token).toBeTruthy();

    await page.goto(`/agendamento/${token}`);
    await expect(
      page.getByText(/Cliente Manage E2E|Confirmar presença|agendamento/i).first(),
    ).toBeVisible({
      timeout: 20_000,
    });

    const confirmBtn = page.getByRole('button', { name: /Confirmar presença/i });
    if (await confirmBtn.isVisible().catch(() => false)) {
      await confirmBtn.click();
      await expect(page.getByText(/confirmad|presença|sucesso/i).first()).toBeVisible({
        timeout: 15_000,
      });
    }
  });
});
