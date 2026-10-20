import { test, expect, type Page } from '@playwright/test';

// Signed-in customer: name/phone come from the account, no consent checkbox, Kaspi invoice number.
async function setup(page: Page) {
  const orders: Record<string, unknown>[] = [];
  await page.addInitScript(() => {
    const token = 'test-account-token';
    localStorage.setItem('account_token', token);
    localStorage.setItem('s24_account_token_v1', token);
    localStorage.setItem('account_user_profile', JSON.stringify({ id: 'u1', name: 'Алия', phone: '+77011234567', password: '' }));
  });
  await page.route('**/*', route => { const url = new URL(route.request().url()); return url.hostname === '127.0.0.1' ? route.continue() : route.abort(); });
  await page.route('**/api/**', async route => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    let body: unknown = { items: [], total: 0 };
    if (path.endsWith('/modules')) body = { food: true };
    if (path.endsWith('/account/me')) body = { id: 'u1', name: 'Алия', phone: '+77011234567' };
    if (path.includes('food_restaurants')) body = { items: [{ id: 1, name: 'DAM ALEM 2.0' }] };
    if (path === '/api/v1/dam-alem/menu/catalog') body = { business_id: 'dam_alem', restaurant_id: 1, categories: [{ id: 1, name: 'Пицца', slug: 'pizza' }], products: [{ id: 1, restaurant_id: 1, category_id: 1, name: 'Маргарита', price: 2500, available: true, is_active: true, sellable: true, modifiers_enabled: false, modifier_groups: [] }], groups: [], options: [], links: [] };
    if (path.includes('food_settings')) body = { items: Object.entries({ min_order_amount: '0', service_fee_rate: '0', promo_codes: '[]', loyalty_gifts: '[]', kitchen_open: '00:00', kitchen_close: '00:00' }).map(([setting_key, setting_value]) => ({ setting_key, setting_value })) };
    if (path.endsWith('/entities/food_orders') && req.method() === 'POST') { orders.push(req.postDataJSON()); body = { id: 501 }; }
    await route.fulfill({ json: body });
  });
  return orders;
}

test('signed-in checkout: no consent checkbox, no name re-entry, Kaspi number', async ({ page }) => {
  const orders = await setup(page);
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/food', { waitUntil: 'domcontentloaded' });
  await page.locator('.dam-grid-card').filter({ hasText: 'Маргарита' }).first().getByRole('button', { name: 'В корзину', exact: true }).click();
  await page.getByTestId('dam-cart-open').click();
  await page.getByTestId('dam-cart-checkout').click();
  await expect(page.getByTestId('dam-checkout')).toBeVisible();
  await page.getByTestId('dam-checkout-overlay').getByText('Самовывоз', { exact: true }).click();
  await page.getByTestId('dam-checkout-next').click();
  const card = page.getByTestId('dam-contact-card');
  await expect(card).toContainText('Алия');
  await expect(card).toContainText('+77011234567');
  await expect(page.getByText(/Фамилия/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Kaspi', exact: true }).click();
  await expect(page.getByLabel(/Номер для счёта/)).toHaveValue('+77011234567');
  await page.screenshot({ path: test.info().outputPath('step2.png'), fullPage: true });
  await page.getByTestId('dam-checkout-next').click();
  await expect(page.getByRole('checkbox')).toHaveCount(0);
  await expect(page.getByText(/Нажимая «Оформить заказ»/)).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('step3.png'), fullPage: true });
  await page.getByTestId('dam-checkout-submit').click();
  await expect.poll(() => orders.length).toBe(1);
  expect(orders[0]).toMatchObject({ customer_name: 'Алия', customer_phone: '+77011234567', legal_accepted: true, payment_method: 'kaspi_qr', payment_phone: '+77011234567' });
  await expect(page.getByText('Ожидайте счёт в Kaspi')).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('success.png'), fullPage: true });
  expect(errors).toEqual([]);
});

test('name can still be changed', async ({ page }) => {
  const orders = await setup(page);
  await page.goto('/food', { waitUntil: 'domcontentloaded' });
  await page.locator('.dam-grid-card').filter({ hasText: 'Маргарита' }).first().getByRole('button', { name: 'В корзину', exact: true }).click();
  await page.getByTestId('dam-cart-open').click();
  await page.getByTestId('dam-cart-checkout').click();
  await page.getByTestId('dam-checkout-overlay').getByText('Самовывоз', { exact: true }).click();
  await page.getByTestId('dam-checkout-next').click();
  await page.getByTestId('dam-contact-card').getByRole('button', { name: 'Изменить' }).click();
  await page.getByLabel(/Ваше имя/).fill('Марат');
  await page.getByTestId('dam-checkout-next').click();
  await page.getByTestId('dam-checkout-submit').click();
  await expect.poll(() => orders.length).toBe(1);
  expect(orders[0]).toMatchObject({ customer_name: 'Марат', payment_method: 'cash', legal_accepted: true });
});
