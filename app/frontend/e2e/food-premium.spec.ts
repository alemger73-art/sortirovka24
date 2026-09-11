import { test, expect } from '@playwright/test';

// Deterministic catalog: every API request is intercepted; no live orders.
async function mockCatalog(page: import('@playwright/test').Page) {
  await page.route('**/*', route => { const url = new URL(route.request().url()); return url.hostname === '127.0.0.1' || url.pathname.includes('/api/') ? route.continue() : route.abort(); });
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown = { items: [], total: 0 };
    if (path.includes('food_restaurants')) body = { items: [{ id: 1, name: 'DAM ALEM 2.0' }] };
    if (path === '/api/categories') body = { categories: [{ id: 1, name: 'Пицца', slug: 'pizza' }, { id: 2, name: 'Напитки', slug: 'napitki' }] };
    if (path === '/api/products') body = { products: [
      { id: 1, category_id: 1, title: 'Маргарита', description: 'Томаты, моцарелла, базилик', image: '/food-hero-reference.png', price: 2500, available: true },
      { id: 2, category_id: 2, title: 'Лимонад', description: 'Лимон и мята', image: '/food-hero-reference.png', price: 600, available: true },
      { id: 3, category_id: 2, title: 'Нет в наличии', price: 500, available: false },
    ] };
    if (path.includes('food_settings')) body = { items: Object.entries({ min_order_amount: '3000', service_fee_rate: '0', free_delivery_from: '8000', promo_codes: '[]', loyalty_gifts: '[]', kitchen_open: '00:00', kitchen_close: '00:00' }).map(([setting_key, setting_value]) => ({ setting_key, setting_value })) };
    await route.fulfill({ json: body });
  });
}

test('cart totals, minimum, persistence, removal and checkout', async ({ page }, info) => {
  await mockCatalog(page);
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/food', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.dam-grid-card').first()).toBeVisible({ timeout: 30000 });
  await expect(page.getByText('Нет в наличии', { exact: true })).toHaveCount(0);
  await expect(page.locator('.dam-promo-strip')).toHaveCount(0);
  await expect(page.locator('.dam-grid-card__tag').filter({ hasText: '200 г' })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({ path: test.info().outputPath(`menu-${info.project.name}.png`), fullPage: true, animations: 'disabled' });
  await page.locator('.dam-grid-card').filter({ hasText: 'Маргарита' }).first().getByRole('button', { name: 'В корзину', exact: true }).click();
  await page.getByTestId('dam-cart-open').click();
  await expect(page.getByTestId('dam-cart-checkout')).toBeDisabled();
  await expect(page.locator('.dam-cart-totals__pay strong')).toContainText('2 500');
  await page.getByTestId('dam-cart-qty-plus').click();
  await expect(page.getByTestId('dam-cart-qty-value')).toHaveText('2');
  await expect(page.getByTestId('dam-cart-checkout')).toBeEnabled();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('dam-cart-qty-value')).toHaveText('2');
  await expect(page.locator('.dam-cart-totals__pay strong')).toContainText('5 000');
  await page.screenshot({ path: test.info().outputPath(`cart-${info.project.name}.png`), fullPage: true, animations: 'disabled' });
  await page.getByTestId('dam-cart-checkout').click();
  await expect(page.getByTestId('dam-checkout')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Удалить Маргарита', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Корзина пуста' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('corrupted storage preserves valid lines', async () => {
  const { loadFoodCart } = await import('../src/lib/foodCartStorage');
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: () => JSON.stringify([null, { itemId: 1, quantity: -3 }, { itemId: 1, quantity: 1.5 }, { itemId: 1, quantity: 2, selections: { 1: [2, 2, 'bad', -1] } }, { itemId: 2, quantity: 1 }]),
  } });
  try {
    const cart = loadFoodCart([{ id: 1, name: 'Test', price: 100, category_id: 1 }, { id: 2, name: 'Unavailable', price: 100, category_id: 1, available: false }]);
    expect(cart).toHaveLength(1);
    expect(cart[0].quantity).toBe(2);
    expect(cart[0].selections).toEqual({ 1: [2] });
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

test('configured promo applies and server rejection never invents a discount', async ({ page }) => {
  await mockCatalog(page);
  await page.route('**/api/v1/entities/food_settings**', route => route.fulfill({ json: { items: Object.entries({ min_order_amount: '0', service_fee_rate: '0', promo_codes: JSON.stringify([{ code: 'TEST10', type: 'percent', value: 10, active: true }]), loyalty_gifts: '[]' }).map(([setting_key, setting_value]) => ({ setting_key, setting_value })) } }));
  let reject = false;
  await page.route('**/api/v1/food/validate-promo', route => reject
    ? route.fulfill({ status: 400, json: { detail: 'Промокод больше не действует' } })
    : route.fulfill({ json: { valid: true, code: 'TEST10', discount: 250, free_delivery: false, label: 'Скидка 10%' } }));
  await page.goto('/food', { waitUntil: 'domcontentloaded' });
  await page.locator('.dam-grid-card').filter({ hasText: 'Маргарита' }).first().getByRole('button', { name: 'В корзину', exact: true }).click();
  await page.getByTestId('dam-cart-open').click();
  await page.getByLabel('Промокод', { exact: true }).fill('TEST10');
  await page.getByRole('button', { name: 'Применить', exact: true }).click();
  await expect(page.locator('.dam-cart-promo__ok')).toContainText('TEST10');
  await expect(page.locator('.dam-cart-totals__pay strong')).toContainText('2 250');
  await page.getByRole('button', { name: 'Сбросить', exact: true }).click();
  reject = true;
  await page.getByLabel('Промокод', { exact: true }).fill('TEST10');
  await page.getByRole('button', { name: 'Применить', exact: true }).click();
  await expect(page.getByText('Промокод больше не действует', { exact: true })).toBeVisible();
  await expect(page.locator('.dam-cart-promo__ok')).toHaveCount(0);
  await expect(page.locator('.dam-cart-totals__pay strong')).toContainText('2 500');
});
