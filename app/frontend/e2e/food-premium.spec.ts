import { test, expect } from '@playwright/test';

// Deterministic catalog: every API request is intercepted; no live orders.
async function mockCatalog(page: import('@playwright/test').Page) {
  // Checkout needs a signed-in customer (sign-in happens before address and payment).
  await page.addInitScript(() => {
    localStorage.setItem('account_token', 'test-account-token');
    localStorage.setItem('s24_account_token_v1', 'test-account-token');
    localStorage.setItem('account_user_profile', JSON.stringify({ id: 'u1', name: 'Тест', phone: '+77001234567', password: '' }));
  });
  await page.route('**/*', route => { const url = new URL(route.request().url()); return url.hostname === '127.0.0.1' || url.pathname.includes('/api/') ? route.continue() : route.abort(); });
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown = { items: [], total: 0 };
    if (path.endsWith('/modules')) body = { food: true };
    if (path.endsWith('/account/me')) body = { id: 'u1', name: 'Тест', phone: '+77001234567' };
    if (path.includes('food_restaurants')) body = { items: [{ id: 1, name: 'DAM ALEM 2.0' }] };
    if (path === '/api/categories') body = { categories: [{ id: 1, name: 'Пицца', slug: 'pizza' }, { id: 2, name: 'Напитки', slug: 'napitki' }] };
    if (path === '/api/v1/dam-alem/menu/catalog') body = {business_id:'dam_alem',restaurant_id:1,categories:[{id:1,name:'Пицца',slug:'pizza'},{id:2,name:'Напитки',slug:'napitki'}],products:[{id:1,restaurant_id:1,category_id:1,name:'Маргарита',description:'Томаты, моцарелла, базилик',image_url:'/food-hero-reference.png',price:2500,available:true,is_active:true,sellable:true,modifiers_enabled:false,modifier_groups:[]},{id:2,restaurant_id:1,category_id:2,name:'Лимонад',price:600,available:true,is_active:true,sellable:true,modifiers_enabled:false,modifier_groups:[]},{id:3,restaurant_id:1,category_id:2,name:'Нет в наличии',price:500,available:false,is_active:true,sellable:false,modifier_groups:[]}],groups:[],options:[],links:[]};
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
  await page.locator('#dam-menu .dam-grid-card').filter({ hasText: 'Маргарита' }).first().getByRole('button', { name: 'Добавить: Маргарита', exact: true }).click();
  await page.getByTestId('dam-cart-open').click();
  const screen = page.getByTestId('dam-order-screen');
  await screen.getByRole('group', { name: 'Способ получения' }).getByRole('button', { name: 'Самовывоз' }).click();
  await expect(page.getByTestId('dam-checkout-block-reason')).toHaveText('Минимальная сумма заказа — 3 000 ₸');
  await expect(page.getByTestId('dam-checkout-submit')).toHaveText('Заказать · 2 500 ₸');
  await page.getByTestId('dam-cart-qty-plus').click();
  await expect(page.getByTestId('dam-cart-line')).toContainText('2');
  await expect(page.getByTestId('dam-checkout-block-reason')).toHaveCount(0);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await screen.getByRole('group', { name: 'Способ получения' }).getByRole('button', { name: 'Самовывоз' }).click();
  await expect(page.getByTestId('dam-checkout-submit')).toHaveText('Заказать · 5 000 ₸');
  await page.screenshot({ path: test.info().outputPath(`cart-${info.project.name}.png`), fullPage: true, animations: 'disabled' });
  for (let i = 0; i < 2; i++) await page.getByRole('button', { name: 'Убрать одну порцию: Маргарита', exact: true }).click();
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
    expect(cart[0].selections).toEqual({1:[2,2]}); // Preserve modifier quantity while dropping invalid IDs.
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
  await page.locator('#dam-menu .dam-grid-card').filter({ hasText: 'Маргарита' }).first().getByRole('button', { name: 'Добавить: Маргарита', exact: true }).click();
  await page.getByTestId('dam-cart-open').click();
  await page.getByTestId('dam-order-screen').getByRole('group', { name: 'Способ получения' }).getByRole('button', { name: 'Самовывоз' }).click();
  const submit = page.getByTestId('dam-checkout-submit');
  await page.getByTestId('dam-promo-toggle').click();
  await page.getByLabel('Промокод', { exact: true }).fill('TEST10');
  await page.getByRole('button', { name: 'Применить', exact: true }).click();
  await expect(page.getByTestId('dam-order-summary')).toContainText('Промокод TEST10');
  await expect(submit).toHaveText('Заказать · 2 250 ₸');
  await page.getByRole('button', { name: 'Сбросить', exact: true }).click();
  reject = true;
  await page.getByLabel('Промокод', { exact: true }).fill('TEST10');
  await page.getByRole('button', { name: 'Применить', exact: true }).click();
  await expect(page.getByText('Промокод больше не действует', { exact: true })).toBeVisible();
  await expect(page.getByTestId('dam-order-summary')).not.toContainText('Промокод');
  await expect(submit).toHaveText('Заказать · 2 500 ₸');
});

test('every eligible gift is offered: the first is picked for the customer and «Сменить» takes the other', async ({ page }) => {
  await mockCatalog(page);
  const gifts = [
    { id: 'gift-cotton', min_amount: 2000, title: 'Сладкая вата', product_name: 'Сладкая вата', description: 'Десерт в подарок', is_active: true, sort_order: 1 },
    { id: 'gift-waffle', min_amount: 2000, title: 'Вафли с фруктами', product_name: 'Вафли с фруктами', description: 'Десерт в подарок', is_active: true, sort_order: 2 },
  ];
  await page.route('**/api/v1/entities/food_settings**', route => route.fulfill({ json: { items: Object.entries({ min_order_amount: '0', service_fee_rate: '0', free_delivery_from: '0', loyalty_enabled: '1', loyalty_gifts: JSON.stringify(gifts), kitchen_open: '00:00', kitchen_close: '00:00' }).map(([setting_key, setting_value]) => ({ setting_key, setting_value })) } }));
  await page.route('**/api/v1/dam-alem/menu/catalog', route => route.fulfill({ json: {business_id:'dam_alem',restaurant_id:1,categories:[{id:1,name:'Пицца',slug:'pizza'},{id:2,name:'Напитки',slug:'napitki'}],products:[
    { id: 1, restaurant_id:1, category_id: 1, name: 'Маргарита', description: 'Пицца', price: 2500, available: true, is_active:true,sellable:true,modifiers_enabled:false,modifier_groups:[] },
    { id: 10, restaurant_id:1, category_id: 2, name: 'Сладкая вата', price: 500, available: true,is_active:true,sellable:true,modifiers_enabled:false,modifier_groups:[] },
    { id: 11, restaurant_id:1, category_id: 2, name: 'Вафли с фруктами', price: 1200, available: true,is_active:true,sellable:true,modifiers_enabled:false,modifier_groups:[] },
  ],groups:[],options:[],links:[] } }));

  const orders: Record<string, unknown>[] = [];
  await page.route('**/api/v1/entities/food_orders', route => { orders.push(route.request().postDataJSON()); return route.fulfill({ json: { id: 7 } }); });
  await page.goto('/food', { waitUntil: 'domcontentloaded' });
  await page.locator('#dam-menu .dam-grid-card').filter({ hasText: 'Маргарита' }).first().getByRole('button', { name: 'Добавить: Маргарита', exact: true }).click();
  await page.getByTestId('dam-cart-open').click();
  const screen = page.getByTestId('dam-order-screen');
  await screen.getByRole('group', { name: 'Способ получения' }).getByRole('button', { name: 'Самовывоз' }).click();
  const gift = page.getByTestId('dam-gift');
  await expect(gift).toContainText('Ваш подарок: Сладкая вата');
  await gift.click();
  await expect(gift).toContainText('Ваш подарок: Вафли с фруктами');
  await expect(screen.getByLabel('Имя')).toHaveValue('Тест');  // from the account, not typed again
  await page.getByTestId('dam-checkout-submit').click();
  await expect.poll(() => orders.length).toBe(1);
  expect(orders[0]).toMatchObject({ selected_gift_id: 'gift-waffle', customer_name: 'Тест' });
});
