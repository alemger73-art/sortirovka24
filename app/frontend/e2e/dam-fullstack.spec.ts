import { test, expect, type Page, type APIRequestContext } from '@playwright/test';

// Real API and database (disposable). Only the geocoder is fake. Customer orders in the browser,
// the operator works the order through the real operations API, the customer sees each step.
const OPS = '/api/v1/dam-alem/operations';
let tokens: { operator: string; client: string; admin: string };

test.beforeAll(async ({ request }) => {
  tokens = await (await request.get('/__test__/sessions')).json();
});
test.beforeEach(async ({ page, request }) => {
  await request.post('/__test__/reset-rate-limits');
  await page.addInitScript(token => {
    localStorage.setItem('app_lang', 'ru');
    localStorage.setItem('account_token', token);
    localStorage.setItem('s24_account_token_v1', token);
    sessionStorage.setItem('s24_welcome_done', '1');
  }, tokens.client);
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
});

const ops = (request: APIRequestContext) => ({
  get: async (id: number) => (await (await request.get(`${OPS}/orders/${id}`, { headers: { Authorization: `Bearer ${tokens.operator}` } })).json()).order,
  patch: async (id: number, values: Record<string, unknown>) => {
    const order = await ops(request).get(id);
    const r = await request.patch(`${OPS}/orders/${id}`, { headers: { Authorization: `Bearer ${tokens.operator}` }, data: { expected_version: order.version, ...values } });
    expect(r.status(), await r.text()).toBe(200);
    return r.json();
  },
  invoice: async (id: number) => {
    const r = await request.post(`${OPS}/orders/${id}/invoice-sent`, { headers: { Authorization: `Bearer ${tokens.operator}` } });
    expect(r.status(), await r.text()).toBe(200);
  },
});

async function toCheckout(page: Page, dish: string) {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/food');
  await page.locator('.dam-grid-card').filter({ hasText: dish }).first().getByRole('button', { name: 'В корзину', exact: true }).click();
  await page.getByTestId('dam-cart-open').click();
  await page.getByTestId('dam-cart-checkout').click();
  await expect(page.getByTestId('dam-checkout')).toBeVisible();
  return errors;
}

async function placedOrderId(page: Page) {
  const created = page.waitForResponse(r => r.url().includes('/entities/food_orders') && r.request().method() === 'POST');
  await page.getByTestId('dam-checkout-submit').click();
  const response = await created;
  expect(response.status(), await response.text()).toBe(201);
  const body = await response.json();
  return Number(body.id ?? body.data?.id);
}

test('delivery + Kaspi: address, account contacts, invoice, payment, kitchen, delivery statuses', async ({ page, request }, info) => {
  const errors = await toCheckout(page, 'Пепперони');
  await page.getByTestId('dam-checkout-overlay').getByText('Доставка', { exact: true }).first().click();
  await page.getByPlaceholder('Например: пер. Урановый 10').fill('пер. Урановый 10');
  await page.getByPlaceholder('Например: пер. Урановый 10').press('Enter');
  await expect(page.getByText(/Зона: Сортировка/)).toBeVisible();
  await page.screenshot({ path: info.outputPath('1-address.png') });
  await page.getByTestId('dam-checkout-next').click();
  await expect(page.getByTestId('dam-contact-card')).toContainText('Тестовый клиент');
  await page.getByRole('button', { name: 'Kaspi', exact: true }).click();
  await page.getByTestId('dam-checkout-next').click();
  await expect(page.getByRole('checkbox', { name: /Принимаю|согласие|политик/i })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('2-confirm.png') });
  const id = await placedOrderId(page);
  await expect(page.getByText('Ожидайте счёт в Kaspi')).toBeVisible();

  const o = await ops(request).get(id);
  expect(o.invoice_phone).toBe('+77000000000');
  expect(o.workflow_state).toBe('WAITING_PAYMENT');
  expect(o.delivery_method).toBe('delivery');
  expect(Number(o.total_amount)).toBe(3700); // 3200 + delivery 500, computed by the server

  await page.goto(`/cabinet/orders/food/${id}`);
  await expect(page.getByText(/Готовим счёт в Kaspi на 3[\s ]700/)).toBeVisible();
  await ops(request).invoice(id);
  await expect(page.getByText(/Счёт ждёт вас в Kaspi/)).toBeVisible({ timeout: 20000 });
  await page.screenshot({ path: info.outputPath('3-cabinet-invoice.png') });

  await ops(request).patch(id, { payment_status: 'paid' });
  await expect(page.getByText(/Оплачено через Kaspi/)).toBeVisible({ timeout: 20000 });
  await ops(request).patch(id, { status: 'preparing' });
  await ops(request).patch(id, { status: 'ready' });
  await page.reload();
  await expect(page.getByText('Готов', { exact: false }).first()).toBeVisible();
  await page.screenshot({ path: info.outputPath('4-cabinet-ready.png') });
  expect(errors).toEqual([]);
});

test('pickup + cash: full lifecycle to done, order in history', async ({ page, request }, info) => {
  const errors = await toCheckout(page, 'Пепперони');
  await page.getByTestId('dam-checkout-overlay').getByText('Самовывоз', { exact: true }).click();
  await page.getByTestId('dam-checkout-next').click();
  await expect(page.getByTestId('dam-contact-card')).toBeVisible();
  await page.getByTestId('dam-checkout-next').click();
  const id = await placedOrderId(page);
  for (const status of ['preparing', 'ready']) await ops(request).patch(id, { status });
  await ops(request).patch(id, { payment_status: 'paid' });
  await ops(request).patch(id, { status: 'done' });
  await page.goto('/cabinet?tab=orders');
  await expect(page.getByText(new RegExp(`№\\s?${id}|#${id}`)).first()).toBeVisible();
  await page.goto(`/cabinet/orders/food/${id}`);
  await expect(page.getByRole('button', { name: /Заказать снова|Повторить/ })).toBeVisible();
  await page.screenshot({ path: info.outputPath('5-done.png') });
  expect(errors).toEqual([]);
});

test('second order: name and phone are still filled, no re-entry', async ({ page }) => {
  await toCheckout(page, 'Пепперони');
  await page.getByTestId('dam-checkout-overlay').getByText('Самовывоз', { exact: true }).click();
  await page.getByTestId('dam-checkout-next').click();
  await expect(page.getByTestId('dam-contact-card')).toContainText('+77000000000');
});

test.describe('statistics and error watch', () => {
  // A real phone browser (the statistics ignore headless robots on purpose).
  test.use({ userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-A546B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36' });

  test('a visit, a search, an order and a broken page reach the owner\'s statistics', async ({ page, request }, info) => {
    const admin = { Authorization: `Bearer ${tokens.admin}` };
    const before = await (await request.get('/api/v1/site-analytics/summary?days=1', { headers: admin })).json();
    // Request interception would cancel the beacons sent while a page closes; real browsers deliver them.
    await page.unrouteAll();
    await toCheckout(page, 'Пепперони');
    await page.keyboard.press('Escape');
    await page.goto('/food');
    await page.getByPlaceholder('Найти блюдо').first().fill('шаурма');
    await page.waitForTimeout(2000);
    await page.evaluate(() => { setTimeout(() => { throw new Error('Synthetic e2e failure 4821'); }, 0); });
    await page.goto('/news');                       // leaving the page flushes the queue
    await expect.poll(async () => {
      const s = await (await request.get('/api/v1/site-analytics/summary?days=1', { headers: admin })).json();
      return s.pageviews > before.pageviews && s.searches_without_results.some((x: { name: string }) => x.name === 'меню: шаурма')
        && s.funnel[1].visitors >= 1 && s.funnel[2].visitors >= 1;
    }, { timeout: 20000 }).toBe(true);
    await expect.poll(async () => (await (await request.get('/api/v1/site-analytics/errors', { headers: admin })).json())
      .items.some((e: { message: string; source: string }) => e.source === 'client' && e.message.includes('Synthetic e2e failure')), { timeout: 15000 }).toBe(true);

    // The owner's page in the admin panel shows it.
    await page.addInitScript(t => { localStorage.setItem('_sp924_token', t); localStorage.setItem('token', t); }, tokens.admin);
    // The admin login service is not part of this test server; the statistics API itself checks the admin token.
    await page.route('**/api/v1/admin-auth/verify-session', r => r.fulfill({ json: { valid: true, username: 'admin' } }));
    await page.route('**/api/v1/admin/**', r => r.fulfill({ json: {} }));
    await page.goto('/admin?tab=analytics');
    await expect(page.locator('h2', { hasText: 'Посещаемость и ошибки' })).toBeVisible({ timeout: 20000 });
    await expect(page.getByText('меню: шаурма').first()).toBeVisible();
    await page.screenshot({ path: info.outputPath('6-admin-stats.png'), fullPage: true });
    await page.getByRole('button', { name: /^Ошибки/ }).click();
    await expect(page.getByText(/Synthetic e2e failure/).first()).toBeVisible();
    await page.screenshot({ path: info.outputPath('7-admin-errors.png'), fullPage: true });
  });
});

test('operator in the browser: Kaspi invoice → «деньги пришли» → can start cooking', async ({ page, browser }, info) => {
  await toCheckout(page, 'Пепперони');
  await page.getByTestId('dam-checkout-overlay').getByText('Самовывоз', { exact: true }).click();
  await page.getByTestId('dam-checkout-next').click();
  await page.getByRole('button', { name: 'Kaspi', exact: true }).click();
  await page.getByTestId('dam-checkout-next').click();
  const id = await placedOrderId(page);

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const op = await ctx.newPage();
  await op.addInitScript(t => { localStorage.setItem('app_lang', 'ru'); localStorage.setItem('_partner_token_dam_alem', t); localStorage.setItem('_dam_alem_partner_token', t); sessionStorage.setItem('s24_welcome_done', '1'); }, tokens.operator);
  await op.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  op.on('dialog', d => void d.accept());
  await op.goto(`/partner/dam-alem?section=orders&order=${id}`);
  await op.getByRole('button', { name: /Счёт выставлен/ }).click();
  await expect(op.getByText(/Счёт выставлен в/)).toBeVisible();
  await op.getByTestId('confirm-bank-payment').click();
  await expect(op.getByRole('heading', { name: /Оплата · Оплачено/ })).toBeVisible();
  await expect(op.getByTestId('confirm-bank-payment')).toHaveCount(0);
  await op.screenshot({ path: info.outputPath('operator-kaspi-paid.png'), fullPage: true });
  const start = op.getByRole('button', { name: /Передать на кухню/ }).first();
  await expect(start).toBeEnabled();
  await ctx.close();
});
