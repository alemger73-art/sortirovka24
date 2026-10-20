import { test, expect, type Page, type APIRequestContext } from '@playwright/test';

// Real API and database (disposable). Only the geocoder is fake. Customer orders in the browser,
// the operator works the order through the real operations API, the customer sees each step.
const OPS = '/api/v1/dam-alem/operations';
let tokens: { operator: string; client: string };

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
