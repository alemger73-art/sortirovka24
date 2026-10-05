import { test, expect, type Page, type Locator } from '@playwright/test';
import { saveFoodCheckoutReturn, takeFoodCheckoutReturn, type FoodCheckoutReturn } from '../src/lib/foodCheckoutReturn';

test.beforeEach(async ({ page, request }, info) => {
  await request.post('/__test__/reset-rate-limits');
  await page.addInitScript(theme => {
    localStorage.setItem('app_lang', 'ru');
    localStorage.setItem('sortirovka-theme', theme);
    sessionStorage.setItem('s24_welcome_done', '1');
  }, info.project.name.endsWith('dark') ? 'dark' : 'light');
  // Every browser destination is loopback. SMS, push and payments are forbidden.
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname !== '127.0.0.1') return route.abort();
    if (route.request().method() !== 'GET' && /request-sms|push|notification|payment|stripe|frontpad/i.test(url.pathname)) {
      throw new Error(`Forbidden external-effect endpoint: ${url.pathname}`);
    }
    return route.continue();
  });
});

async function mockCatalog(page: Page) {
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    let json: unknown = { items: [], total: 0 };
    if (path.endsWith('/modules')) json = { food: true, account: true };
    if (path.includes('food_restaurants')) json = { items: [{ id: 1, name: 'DAM ALEM 2.0', min_order: 0 }] };
    if (path.endsWith('/menu/catalog')) json = {
      business_id: 'dam_alem', restaurant_id: 1,
      categories: [{ id: 1, name: 'Меню', slug: 'menu' }],
      products: [{ id: 1, restaurant_id: 1, category_id: 1, name: 'Синтетическая пицца', price: 6000,
        available: true, is_active: true, sellable: true, modifiers_enabled: false, modifier_groups: [] }],
      groups: [], options: [], links: [],
    };
    if (path.includes('food_settings')) json = { items: Object.entries({
      min_order_amount: '0', service_fee_rate: '0', loyalty_gifts: '[]',
      kitchen_open: '00:00', kitchen_close: '00:00', working_hours: '00:00-23:59',
    }).map(([setting_key, setting_value]) => ({ setting_key, setting_value })) };
    return route.fulfill({ json });
  });
}

async function checkout(page: Page, mock = false, pickup = true) {
  await page.goto('/food');
  const card = page.locator('.dam-grid-card').filter({ hasText: mock ? 'Синтетическая пицца' : 'Пепперони' }).first();
  await card.getByRole('button', { name: 'В корзину', exact: true }).click();
  await page.getByTestId('dam-cart-open').click();
  await contrast(page.getByTestId('dam-cart-checkout'));
  await page.getByTestId('dam-cart-checkout').click();
  if (pickup) await page.getByTestId('dam-checkout').getByRole('button', { name: /^Самовывоз/ }).click();
}

async function contacts(page: Page) {
  await page.getByTestId('dam-checkout-next').click();
  await page.getByPlaceholder('Введите имя').fill('Синтетический клиент');
  await page.getByPlaceholder('+7 (___) ___-__-__').fill('+77000000000');
}

async function geometry(page: Page) {
  const rects = await page.getByTestId('dam-checkout').evaluate(panel => {
    const box = (selector: string) => {
      const el = panel.querySelector(selector)!;
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, width: r.width, height: r.height };
    };
    return { header: box('.dam-sheet-header'), body: box('.dam-sheet-body'), footer: box('.dam-sheet-footer'),
      width: innerWidth, height: innerHeight, overflow: panel.scrollWidth > panel.clientWidth };
  });
  expect(rects.overflow).toBe(false);
  expect(rects.header.bottom).toBeLessThanOrEqual(rects.body.top + 1);
  expect(rects.body.bottom).toBeLessThanOrEqual(rects.footer.top + 1);
  expect(rects.body.height, JSON.stringify(rects)).toBeGreaterThan(40);
  expect(rects.footer.bottom).toBeLessThanOrEqual(rects.height + 1);
  expect(rects.footer.width).toBeLessThanOrEqual(rects.width);
}

async function contrast(locator: Locator) {
  const value = await locator.evaluate(el => {
    const css = getComputedStyle(el);
    const rgb = (s: string) => s.match(/[\d.]+/g)!.map(Number);
    const luminance = (s: string) => rgb(s).slice(0, 3).map(v => {
      const x = v / 255; return x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4;
    }).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
    const a = luminance(css.color), b = luminance(css.backgroundColor);
    return { ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05), alpha: rgb(css.backgroundColor)[3] ?? 1 };
  });
  expect(value.alpha).toBe(1);
  expect(value.ratio).toBeGreaterThanOrEqual(4.5);
}

test('mock: opaque cash states, unchanged change calculation and short-screen geometry', async ({ page }, info) => {
  await mockCatalog(page);
  await checkout(page, true);
  await contacts(page);
  const cash = page.locator('.dam-cash-amount');
  await cash.scrollIntoViewIfNeeded();
  await contrast(cash);
  for (const button of await cash.getByRole('button').all()) await contrast(button);
  await expect(cash.getByRole('button', { name: '5 000 ₸' })).toBeDisabled();
  const bill = cash.getByRole('button', { name: '10 000 ₸' });
  await bill.click();
  await expect(bill).toHaveAttribute('aria-pressed', 'true');
  await expect(cash).toContainText('Сдача: 4 000 ₸');
  await contrast(bill);
  const input = cash.getByLabel('Другая сумма, ₸');
  await contrast(input);
  await input.fill('7000');
  await expect(cash).toContainText('Сдача: 1 000 ₸');
  await input.fill('500');
  await expect(input).toHaveAttribute('aria-invalid', 'true');
  await expect(cash.getByRole('alert')).toContainText('не меньше');
  await cash.getByRole('button', { name: 'Без сдачи', exact: true }).click();
  await expect(input).toHaveAttribute('aria-invalid', 'false');
  await expect(cash).toContainText('Сдача: 0 ₸');
  await page.keyboard.press('Tab');
  await expect(bill).toBeFocused();
  expect(await bill.evaluate(el => getComputedStyle(el).outlineStyle)).toBe('solid');
  await geometry(page);
  await page.screenshot({ path: info.outputPath('cash.png') });
  // Simulated native fallback insets, not a physical phone.
  await page.evaluate(() => document.documentElement.classList.add('native-app'));
  await page.setViewportSize({ width: info.project.use.viewport!.width, height: 320 });
  await geometry(page);
  expect(await page.locator('.dam-sheet-footer').evaluate(el => parseFloat(getComputedStyle(el).paddingBottom))).toBeGreaterThanOrEqual(24);
  expect(await page.locator('.dam-sheet-header').evaluate(el => parseFloat(getComputedStyle(el).paddingTop))).toBeGreaterThanOrEqual(32);
  await page.getByTestId('dam-checkout-next').click();
  await geometry(page);
  await expect(page.getByTestId('dam-checkout-submit')).toBeInViewport();
});

test('local API: ordinary auth clicks retain pickup, contacts, cash and checkout; save one synthetic order', async ({ page }, info) => {
  await checkout(page);
  await contacts(page);
  await page.locator('.dam-cash-amount').getByRole('button', { name: '10 000 ₸' }).click();
  await page.getByTestId('dam-checkout-next').click();
  await page.getByTestId('dam-checkout-submit').click();
  const prompt = page.getByTestId('auth-prompt-modal');
  await expect(prompt).toBeVisible();
  await expect(prompt.getByRole('button').first()).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByTestId('auth-prompt-modal-login')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(prompt).toBeHidden();
  await expect(page.getByTestId('dam-checkout')).toBeVisible();
  await page.getByTestId('dam-checkout-submit').click();
  await page.getByTestId('auth-prompt-modal-login').click();
  await expect(page).toHaveURL(/\/account\?redirect=/);
  await page.getByRole('button', { name: 'Уже есть пароль? Войти по паролю' }).click();
  await page.locator('input[type="tel"]').fill('+77000000000');
  await page.getByPlaceholder('Пароль', { exact: true }).fill('LocalCheckoutOnly2026!');
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page).toHaveURL(/\/food\?tab=cart$/);
  await expect(page.getByTestId('dam-checkout-submit')).toBeVisible();
  await expect(page.getByTestId('dam-checkout')).toContainText('Самовывоз');
  await page.getByRole('button', { name: 'Назад', exact: true }).click();
  await expect(page.getByPlaceholder('Введите имя')).toHaveValue('Синтетический клиент');
  await expect(page.locator('.dam-cash-amount').getByRole('button', { name: '10 000 ₸' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.dam-cash-amount')).toContainText('Сдача: 6 800 ₸');
  await page.getByTestId('dam-checkout-next').click();
  await geometry(page);
  const response = page.waitForResponse(r => r.url().endsWith('/api/v1/entities/food_orders') && r.request().method() === 'POST');
  await page.getByTestId('dam-checkout-submit').click();
  const saved = await response;
  expect(saved.ok()).toBe(true);
  const body = await saved.json();
  const orderId = body.data?.id ?? body.id;
  expect(orderId).toBeGreaterThan(0);
  expect(saved.request().postDataJSON().delivery_method).toBe('pickup');
  expect((body.data ?? body).cash_given_amount).toBe(10000);
  expect((body.data ?? body).change_amount).toBe(6800);
  await expect(page.locator('.dam-success-modal')).toContainText('Самовывоз');
  await page.locator('.dam-success-modal').getByRole('link', { name: 'Мои заказы', exact: true }).click();
  await expect(page).toHaveURL(/\/cabinet$/);
  await page.screenshot({ path: info.outputPath('pickup-return.png') });
});

test('local API: synthetic delivery order success scrolls to tracking link on short screen', async ({ page, request }, info) => {
  const sessions = await (await request.get('/__test__/sessions')).json();
  await page.addInitScript(token => localStorage.setItem('account_token', token), sessions.client);
  await checkout(page, false, false);
  const address = page.getByPlaceholder('Например: пер. Урановый 10');
  await address.fill('пер. Урановый 10');
  await contacts(page);
  await page.getByTestId('dam-checkout-next').click();
  const response = page.waitForResponse(r => r.url().endsWith('/api/v1/entities/food_orders') && r.request().method() === 'POST');
  await page.getByTestId('dam-checkout-submit').click();
  const saved = await response;
  expect(saved.ok()).toBe(true);
  const body = await saved.json();
  const orderId = body.data?.id ?? body.id;
  await page.setViewportSize({ width: info.project.use.viewport!.width, height: 320 });
  const track = page.locator('.dam-success-modal').getByRole('link', { name: 'Отследить заказ', exact: true });
  await track.scrollIntoViewIfNeeded();
  await expect(track).toBeInViewport();
  await contrast(track);
  await contrast(page.locator('.dam-success-modal').getByRole('link', { name: 'Мои заказы', exact: true }));
  await page.screenshot({ path: info.outputPath('track-short-screen.png') });
  await track.click();
  await expect(page).toHaveURL(new RegExp(`/cabinet/orders/food/${orderId}$`));
  await expect(page.getByRole('region', { name: 'Чек заказа' })).toBeVisible();
});

test('form return storage consumes once and rejects expired or corrupted state', async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  const now = Date.now;
  const data = new Map<string, string>();
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
    removeItem: (key: string) => data.delete(key),
  } });
  const form: FoodCheckoutReturn = { step: 3, deliveryMethod: 'pickup', customerName: 'Синтетический клиент',
    customerPhone: '+77000000000', deliveryAddress: '', apartment: '', deliverToApartment: false,
    comment: 'Тест', preorder: false, schedule: '', cashGiven: '10000', payment: 'cash', selectedGiftId: null };
  try {
    saveFoodCheckoutReturn(form);
    expect(takeFoodCheckoutReturn()).toMatchObject(form);
    expect(takeFoodCheckoutReturn()).toBeNull();
    Date.now = () => now() - 31 * 60 * 1000;
    saveFoodCheckoutReturn(form);
    Date.now = now;
    expect(takeFoodCheckoutReturn()).toBeNull();
    saveFoodCheckoutReturn(form);
    for (const key of data.keys()) data.set(key, '{broken');
    expect(takeFoodCheckoutReturn()).toBeNull();
    expect(data.size).toBe(0);
  } finally {
    Date.now = now;
    if (previous) Object.defineProperty(globalThis, 'sessionStorage', previous);
    else Reflect.deleteProperty(globalThis, 'sessionStorage');
  }
});
