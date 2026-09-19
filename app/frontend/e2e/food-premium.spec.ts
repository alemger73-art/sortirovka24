import { test, expect } from '@playwright/test';

// Deterministic catalog: every API request is intercepted; no live orders.
async function mockCatalog(page: import('@playwright/test').Page) {
  await page.route('**/*', route => { const url = new URL(route.request().url()); return url.hostname === '127.0.0.1' || url.pathname.includes('/api/') ? route.continue() : route.abort(); });
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown = { items: [], total: 0 };
    if (path.endsWith('/modules')) body = { food: true };
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

test('checkout shows every eligible gift and requires an explicit choice', async ({ page }) => {
  await mockCatalog(page);
  const gifts = [
    { id: 'gift-cotton', min_amount: 2000, title: 'Сладкая вата', product_name: 'Сладкая вата', description: 'Десерт в подарок', is_active: true, sort_order: 1 },
    { id: 'gift-waffle', min_amount: 2000, title: 'Вафли с фруктами', product_name: 'Вафли с фруктами', description: 'Десерт в подарок', is_active: true, sort_order: 2 },
  ];
  await page.route('**/api/v1/entities/food_settings**', route => route.fulfill({ json: { items: Object.entries({ min_order_amount: '0', service_fee_rate: '0', free_delivery_from: '0', loyalty_enabled: '1', loyalty_gifts: JSON.stringify(gifts), kitchen_open: '00:00', kitchen_close: '00:00' }).map(([setting_key, setting_value]) => ({ setting_key, setting_value })) } }));
  await page.route('**/api/products**', route => route.fulfill({ json: { products: [
    { id: 1, category_id: 1, title: 'Маргарита', description: 'Пицца', price: 2500, available: true },
    { id: 10, category_id: 2, title: 'Сладкая вата', price: 500, available: true },
    { id: 11, category_id: 2, title: 'Вафли с фруктами', price: 1200, available: true },
  ] } }));

  await page.goto('/food', { waitUntil: 'domcontentloaded' });
  await page.locator('.dam-grid-card').filter({ hasText: 'Маргарита' }).first().getByRole('button', { name: 'В корзину', exact: true }).click();
  await page.getByTestId('dam-cart-open').click();
  await page.getByTestId('dam-cart-checkout').click();
  await page.getByRole('button', { name: /Самовывоз/ }).click();
  await page.getByTestId('dam-checkout-next').click();

  const giftChoice = page.locator('#dam-checkout-gift-choice');
  await expect(giftChoice.getByText('Выберите один подарок бесплатно', { exact: true })).toBeVisible();
  await expect(giftChoice.getByRole('button')).toHaveCount(2);
  await page.getByPlaceholder('Введите имя').fill('Алемгер');
  await page.getByPlaceholder('+7 (___) ___-__-__').fill('+77004280280');
  await page.getByTestId('dam-checkout-next').click();
  await expect(page.getByText('Выберите один бесплатный подарок', { exact: true }).last()).toBeVisible();
  await expect(page.getByText('Контактные данные', { exact: true })).toBeVisible();

  await giftChoice.getByRole('button').filter({ hasText: 'Сладкая вата' }).click();
  await page.getByTestId('dam-checkout-next').click();
  await expect(page.getByTestId('dam-checkout-submit')).toBeVisible();
});
