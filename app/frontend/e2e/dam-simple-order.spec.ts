import { test, expect, type Page } from '@playwright/test';

// DÄM ALEM «простой заказ»: «+» from the menu, cart and checkout on one screen, «Заказ принят», operator board.
// Everything below talks to a mocked API only.
test.use({ viewport: { width: 360, height: 780 } });

const SHOTS = process.env.DAM_SHOTS_DIR;
const THEME = process.env.DAM_THEME === 'dark' ? 'dark' : 'light';
const LOCAL = new Set(['127.0.0.1', 'localhost']);

const PRODUCTS = [
  { id: 14, category_id: 7, name: 'UFO Бургер говяжий', price: 2000, is_popular: true },
  { id: 18, category_id: 8, name: 'Пепперони', price: 3200, weight: '30 см', is_popular: true },
  { id: 15, category_id: 7, name: 'UFO Бургер куриный', price: 1600 },
  { id: 25, category_id: 9, name: 'Картофель фри', price: 1500 },
].map(p => ({ restaurant_id: 1, available: true, is_active: true, sellable: true, modifiers_enabled: false, modifier_groups: [], ...p }));

type Options = { signedIn: boolean; serviceFee?: string };

async function setup(page: Page, { signedIn, serviceFee = '0' }: Options) {
  const orders: Record<string, unknown>[] = [];
  const state = { status: 'new' };
  await page.addInitScript(([signed, theme]) => {
    localStorage.setItem('app_lang', 'ru');
    localStorage.setItem('sortirovka-theme', String(theme));
    sessionStorage.setItem('s24_welcome_done', '1');
    localStorage.setItem('s24_welcome_bonus_dismissed', String(Date.now()));
    if (signed) {
      localStorage.setItem('account_token', 'test-account-token');
      localStorage.setItem('s24_account_token_v1', 'test-account-token');
      localStorage.setItem('account_user_profile', JSON.stringify({ id: 'u1', name: 'Айгерим', phone: '+77012345678', password: '' }));
    }
  }, [signedIn, THEME]);
  await page.route('**/*', route => LOCAL.has(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
  await page.route('**/api/**', async route => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    let json: unknown = { items: [], total: 0 };
    if (path.endsWith('/modules')) json = { food: true, account: true };
    if (path.endsWith('/account/me')) json = signedIn ? { id: 'u1', name: 'Айгерим', phone: '+77012345678' } : {};
    if (path.endsWith('/account/bonus-rules')) json = { enabled: true, tenge_rate: 1, max_order_percent: 20, registration: { points: 300 }, earn: { percent: 3, welcome_points: 300 } };
    if (path.endsWith('/dam-alem/loyalty/me')) json = { balance: 300, rules: {} };
    if (path.includes('food_restaurants')) json = { items: [{ id: 1, name: 'DAM ALEM 2.0', min_order: 0 }] };
    if (path.endsWith('/menu/catalog')) json = {
      business_id: 'dam_alem', restaurant_id: 1, groups: [], options: [], links: [],
      categories: [{ id: 7, name: 'UFO Бургеры' }, { id: 8, name: 'Пиццы' }, { id: 9, name: 'Закуски' }],
      products: PRODUCTS,
    };
    if (path.includes('food_settings')) json = { items: Object.entries({
      whatsapp_number: '+77470304096', min_order_amount: '0', delivery_price: '500', free_delivery_from: '15000',
      service_fee_rate: serviceFee, delivery_zones: '[]', delivery_time: '35-45', working_hours: '00:00 – 23:59',
      loyalty_enabled: '1',
      loyalty_gifts: JSON.stringify([
        { id: 'fries', title: 'Картофель фри 150 г', min_amount: 5000, is_active: true, sort_order: 1 },
        { id: 'lemonade', title: 'Лимонад 0,5 л', min_amount: 5000, is_active: true, sort_order: 2 },
      ]),
      promo_codes: '[]',
    }).map(([setting_key, setting_value]) => ({ setting_key, setting_value })) };
    if (path.endsWith('/dam-alem/checkout-config')) json = {
      timezone: 'Asia/Almaty', working_hours: '10:00–22:00', days: [],
      policy: { enabled: true, min_minutes: 60, advance_days: 2, step_minutes: 30, closed_dates: [], prepare_minutes: 30 },
      pickup: { display_name: 'DÄM ALEM', address: 'Сортировка, ул. Защитная, 1', instructions: 'Позвоним, когда будет готово.', photo: '', latitude: null, longitude: null },
    };
    if (path.endsWith('/food/validate-promo')) {
      const body = req.postDataJSON();
      json = body.code === 'DAMALEM10'
        ? { valid: true, code: 'DAMALEM10', type: 'percent', label: '−10% на заказ', discount: Math.floor(body.cart_subtotal / 10), free_delivery: false }
        : null;
      if (!json) return route.fulfill({ status: 400, json: { detail: 'Промокод недействителен' } });
    }
    if (path.endsWith('/entities/food_orders') && req.method() === 'POST') {
      const body = req.postDataJSON();
      orders.push(body);
      json = { id: 1047, total_amount: body.total_amount, loyalty_snapshot: { eligible_amount: '6100', bonus_rate: '3', policy: { earning_enabled: true } } };
    }
    if (path.endsWith('/account/orders/food/1047')) json = { id: 1047, status: state.status, delivery_method: 'pickup' };
    await route.fulfill({ json });
  });
  return { orders, state };
}

async function openMenu(page: Page) {
  await page.goto('/food');
  await expect(page.locator('.dam-grid-card').first()).toBeVisible({ timeout: 30_000 });
}

async function shot(page: Page, name: string, fullPage = false) {
  if (!SHOTS) return;
  await page.waitForTimeout(400);
  await page.evaluate(() => document.querySelectorAll<HTMLElement>('[data-sonner-toaster]').forEach(el => { el.style.display = 'none'; }));
  await page.screenshot({ path: `${SHOTS}/${name}${THEME === 'dark' ? '-dark' : ''}.png`, fullPage, animations: 'disabled' });
}

const card = (page: Page, name: string) => page.locator('#dam-menu .dam-grid-card').filter({ hasText: name }).first();

test('menu: facts on top, «Хиты», «+» adds without opening the dish, stepper and cart bar with the fee', async ({ page }) => {
  await setup(page, { signedIn: true, serviceFee: '10' });
  await openMenu(page);
  const facts = page.getByRole('region', { name: 'Условия доставки' });
  await expect(facts).toContainText('35–45 мин');
  await expect(facts).toContainText('500 ₸');
  await expect(facts).toContainText('бесплатно от 15 000 ₸');
  await expect(page.locator('#alem-hits')).toContainText('Пепперони');

  await card(page, 'Пепперони').getByRole('button', { name: 'Добавить: Пепперони' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const stepper = card(page, 'Пепперони');
  await expect(stepper.getByRole('button', { name: 'Добавить ещё порцию: Пепперони' })).toBeVisible();
  await stepper.getByRole('button', { name: 'Добавить ещё порцию: Пепперони' }).click();
  const bar = page.getByTestId('dam-cart-bar');
  await expect(bar).toContainText('Корзина · 2');
  // 6 400 ₸ of food + 10% service fee: the fee is in the total from the start.
  await expect(bar).toContainText('7 040 ₸');
  await expect(bar).toContainText('подарок ваш');
  const box = await card(page, 'Пепперони').getByRole('button', { name: 'Убрать одну порцию: Пепперони' }).boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, '1-menu');

  // The dish card still opens.
  await card(page, 'Картофель фри').getByRole('button', { name: 'Картофель фри' }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('one screen: prefilled contacts, gift, bonus toggle, promo, WhatsApp, order placed with live status', async ({ page }) => {
  const { orders, state } = await setup(page, { signedIn: true, serviceFee: '10' });
  await openMenu(page);
  await card(page, 'Пепперони').getByRole('button', { name: 'Добавить: Пепперони' }).click();
  await card(page, 'UFO Бургер куриный').getByRole('button', { name: 'Добавить: UFO Бургер куриный' }).click();
  await card(page, 'UFO Бургер куриный').getByRole('button', { name: 'Добавить ещё порцию: UFO Бургер куриный' }).click();
  await page.getByTestId('dam-cart-bar').click();

  const screen = page.getByTestId('dam-order-screen');
  await expect(screen.getByRole('heading', { name: 'Корзина' })).toBeVisible();
  await expect(screen.getByLabel('Имя')).toHaveValue('Айгерим');
  await expect(screen.getByLabel('Телефон')).toHaveValue('+77012345678');
  await expect(page.getByTestId('dam-guest-banner')).toHaveCount(0);
  // The gift is picked automatically; «Сменить» goes to the other one.
  const gift = page.getByTestId('dam-gift');
  await expect(gift).toContainText('Ваш подарок: Картофель фри 150 г');
  await gift.click();
  await expect(gift).toContainText('Лимонад 0,5 л');

  await screen.getByRole('group', { name: 'Способ получения' }).getByRole('button', { name: 'Самовывоз' }).click();
  const summary = page.getByTestId('dam-order-summary');
  await expect(summary).toContainText('Сервисный сбор (10%)');
  await expect(summary).toContainText('640 ₸');

  // Bonuses are on by default: 300 of 20% × 6 400 = 1 280.
  const bonus = page.getByTestId('dam-bonus-toggle');
  await expect(bonus).toHaveAttribute('aria-checked', 'true');
  await expect(bonus).toContainText('Списать 300 бонусов');
  await expect(summary).toContainText('−300 ₸');
  await bonus.click();
  await expect(bonus).toHaveAttribute('aria-checked', 'false');
  await expect(summary).not.toContainText('−300 ₸');
  await bonus.click();

  await page.getByTestId('dam-promo-toggle').click();
  await screen.getByLabel('Промокод').fill('damalem10');
  await screen.getByRole('button', { name: 'Применить' }).click();
  await expect(summary).toContainText('Промокод DAMALEM10');
  await expect(summary).toContainText('−640 ₸');

  // 6 400 + 640 fee − 640 promo − bonuses (the promo turns bonuses off) = 6 400 ₸.
  const submit = page.getByTestId('dam-checkout-submit');
  await expect(submit).toHaveText('Заказать · 6 400 ₸');
  await expect(page.getByTestId('dam-cashback')).toContainText('После доставки вернём 173 бонуса');

  const wa = page.getByTestId('dam-whatsapp-order');
  const href = decodeURIComponent((await wa.getAttribute('href'))!).replace(/\u00a0/g, ' ');
  expect(href).toContain('https://wa.me/77470304096?text=');
  expect(href).toContain('• Пепперони × 1 — 3 200 ₸');
  expect(href).toContain('• UFO Бургер куриный × 2 — 3 200 ₸');
  expect(href).toContain('Самовывоз');
  expect(href).toContain('Итого: 6 400 ₸');
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, '2-cart-top');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await shot(page, '2-cart-bottom');

  await submit.click();
  await expect.poll(() => orders.length).toBe(1);
  expect(orders[0]).toMatchObject({
    customer_name: 'Айгерим', customer_phone: '+77012345678', delivery_method: 'pickup', payment_method: 'cash',
    promo_code: 'DAMALEM10', selected_gift_id: 'lemonade', service_fee: 640, total_amount: 6400, legal_accepted: true,
  });
  const done = page.getByTestId('dam-order-done');
  await expect(done.getByRole('heading', { name: /Заказ принят/ })).toBeVisible();
  await expect(done).toContainText('Ждём подтверждения');
  await expect(done).toContainText('После доставки начислим 183 бонуса');
  await expect(done).toContainText('оплата при получении');
  await expect(done.getByRole('progressbar')).toHaveAttribute('aria-valuetext', 'Ждём подтверждения');
  // The operator pressed «Принять»: the customer sees «Готовится», then «Готов к выдаче» and «Выдан».
  state.status = 'preparing';
  await expect(done.getByRole('progressbar')).toHaveAttribute('aria-valuetext', /Готовится/, { timeout: 12_000 });
  await shot(page, '3-done', true);
  await shot(page, 'simple2-client-status', true);
  state.status = 'ready';
  await expect(done.getByRole('progressbar')).toHaveAttribute('aria-valuetext', 'Готов к выдаче', { timeout: 12_000 });
});

test('guest orders without signing in; the banner and «Заберите бонусы» offer sign-in', async ({ page }) => {
  const { orders } = await setup(page, { signedIn: false });
  await openMenu(page);
  await card(page, 'Пепперони').getByRole('button', { name: 'Добавить: Пепперони' }).click();
  await card(page, 'Пепперони').getByRole('button', { name: 'Добавить ещё порцию: Пепперони' }).click();
  await page.getByTestId('dam-cart-bar').click();
  const banner = page.getByTestId('dam-guest-banner');
  // 300 welcome bonuses, within 20% of 6 400 ₸.
  await expect(banner).toContainText('Войдите за 10 секунд — с этого заказа спишем 300 бонусов');
  await expect(page.getByTestId('dam-bonus-toggle')).toHaveCount(0);
  await expect(page.getByTestId('dam-order-summary')).not.toContainText('Сервисный сбор');
  await shot(page, '2b-cart-guest');

  const screen = page.getByTestId('dam-order-screen');
  await screen.getByLabel('Адрес', { exact: true }).fill('ул. Защитная, 12');
  await screen.getByLabel('Имя').fill('Ерлан');
  await screen.getByLabel('Телефон').fill('+77054121890');
  // Two ways to pay, both on delivery: no invoice number, no prepayment.
  const payment = screen.getByRole('group', { name: 'Оплата' });
  await expect(payment.getByRole('button')).toHaveText(['Наличными', 'Kaspi переводом']);
  await payment.getByRole('button', { name: 'Kaspi переводом' }).click();
  await expect(screen).toContainText('Оплата при получении');
  await expect(screen.getByText(/счёт/i)).toHaveCount(0);
  await payment.scrollIntoViewIfNeeded();
  await shot(page, 'simple2-checkout-payment');
  await page.getByTestId('dam-checkout-submit').click();
  await expect.poll(() => orders.length).toBe(1);
  expect(orders[0]).toMatchObject({ customer_name: 'Ерлан', delivery_method: 'delivery', payment_method: 'kaspi_transfer' });
  expect(orders[0].payment_phone).toBeUndefined();
  expect(orders[0].bonus_points_to_use).toBeUndefined();
  expect(String(orders[0].delivery_address)).toContain('ул. Защитная, 12');
  const done = page.getByTestId('dam-order-done');
  await expect(done).toContainText('Kaspi переводом');
  await expect(done).not.toContainText('счёт');
  await expect(done).toContainText('Заберите 183 бонуса за этот заказ — войдите');
  await shot(page, '3b-done-guest', true);
  await page.getByTestId('dam-done-login').click();
  await expect(page).toHaveURL(/\/login\?redirect=%2Fcabinet/);
});

test('guest sign-in from the cart keeps the cart and returns to the same screen', async ({ page }) => {
  await setup(page, { signedIn: false });
  await openMenu(page);
  await card(page, 'Пепперони').getByRole('button', { name: 'Добавить: Пепперони' }).click();
  await page.getByTestId('dam-cart-bar').click();
  await page.getByTestId('dam-guest-login').click();
  await expect(page).toHaveURL(/\/login\?redirect=/);
  const redirect = decodeURIComponent(new URL(page.url()).searchParams.get('redirect')!);
  expect(redirect).toMatch(/^\/food\?.*tab=cart.*checkout=resume/);
});

test('operator board: Принять → Готово → Доставлен, no courier, no payment step', async ({ page }) => {
  const order = {
    id: 1047, version: 1, status: 'new', created_at: new Date().toISOString(), customer_name: 'Айгерим', customer_phone: '+77012345678',
    delivery_method: 'delivery', delivery_address: 'ул. Защитная, 12, кв. 4', total_amount: 6900, payment_method: 'cash', payment_status: 'pending',
    order_items: JSON.stringify([{ name: 'Пепперони', quantity: 1, price: 3200 }, { name: 'UFO Бургер куриный', quantity: 2, price: 1600 }]),
    comment: '', operator_note: null, cancellation_reason: null, bonus_discount_amount: 300, operator_runs_delivery: true,
    couriers_enabled: false, payment_steps: false, workflow_state: 'READY_FOR_OPERATOR',
  };
  const patches: Record<string, unknown>[] = [];
  const courierCalls: string[] = [];
  await page.addInitScript(theme => {
    localStorage.setItem('app_lang', 'ru');
    localStorage.setItem('sortirovka-theme', theme);
    sessionStorage.setItem('dam_workstation_session', 'operator');
    sessionStorage.setItem('s24_welcome_done', '1');
    localStorage.setItem('dam_alem_order_alert_sound', 'off');
  }, THEME);
  await page.route('**/*', route => LOCAL.has(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
  await page.route('**/api/**', async route => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    let json: unknown = { items: [], total: 0 };
    if (path.endsWith('/modules')) json = { food: true, dam_alem: true };
    if (path.endsWith('/shifts/me')) json = { staff: { id: 1, name: 'Айжан', role: 'operator', pin_set: true }, shift: { id: 9, staff_name: 'Айжан', role: 'operator', active: true, opened_at: new Date().toISOString() } };
    if (path.endsWith('/business/me')) json = { role: 'operator', name: 'Айжан', couriers_enabled: false };
    if (path.endsWith('/couriers')) courierCalls.push(path);  // couriers are off: the cabinet must not ask for them
    // Shift summary and money screens are not part of this test: they show their own load error.
    if (path.endsWith('/business/today') || path.endsWith('/cashbox/dashboard')) return route.fulfill({ status: 503, json: { detail: 'Нет данных' } });
    if (path.endsWith('/operations/orders')) json = { items: [order], total: 1 };
    if (path.endsWith('/operations/orders/1047')) {
      if (req.method() === 'PATCH') {
        const body = req.postDataJSON();
        patches.push(body);
        Object.assign(order, { status: body.status, version: order.version + 1 });
      }
      json = { order, events: [], delivery: null };
    }
    await route.fulfill({ json });
  });
  await page.goto('/partner/dam-alem/operator');
  const board = page.getByTestId('dam-operator-board');
  await expect(board.getByRole('heading', { name: 'Новые заказы' })).toBeVisible({ timeout: 30_000 });
  const item = page.getByTestId('dam-board-order-1047');
  await expect(item).toContainText('Айгерим');
  await expect(item).toContainText('2 × UFO Бургер куриный');
  await expect(item).toContainText('ул. Защитная, 12, кв. 4');
  await expect(item.getByRole('link', { name: 'Позвонить клиенту' })).toHaveAttribute('href', 'tel:+77012345678');
  // Shift and money are in «Учёт», not on the main screen.
  await expect(page.getByRole('button', { name: 'Учёт' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Закрыть смену/ })).toBeHidden();
  await expect(item).toContainText('Наличными · 6 900 ₸ · при получении');
  await shot(page, '4-operator', true);
  await shot(page, 'simple2-operator-new-orders', true);

  const next = item.getByTestId('dam-board-next');
  await expect(next).toHaveText('Принять');
  await next.click();
  await expect.poll(() => patches.length).toBe(1);
  expect(patches[0]).toEqual({ expected_version: 1, status: 'preparing' });
  await expect(item).toContainText('Готовится');
  await expect(next).toHaveText('Готово');
  await next.click();
  await expect.poll(() => patches.length).toBe(2);
  expect(patches[1]).toEqual({ expected_version: 2, status: 'in_progress' });
  await expect(item).toContainText('В пути');
  await expect(next).toHaveText('Доставлен');
  expect(courierCalls).toEqual([]);
  await expect(item).not.toContainText('курьер');
  await next.click();
  await expect.poll(() => patches.length).toBe(3);
  // The money is taken with «Доставлен» on the server: no separate payment step.
  expect(patches[2]).toEqual({ expected_version: 3, status: 'done' });

  await page.getByRole('button', { name: 'Учёт' }).click();
  const accounting = page.getByRole('navigation', { name: 'Учёт' });
  await expect(accounting.getByRole('button', { name: 'Общая касса' })).toBeVisible();
  await expect(accounting.getByRole('button', { name: 'Доставки' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Закрыть смену/ })).toBeVisible();
  expect(courierCalls).toEqual([]);
});

test('full order card: one next-step button, payment on delivery, no invoice or courier blocks', async ({ page }) => {
  const order = {
    id: 1048, version: 2, status: 'preparing', created_at: new Date().toISOString(), customer_name: 'Ерлан', customer_phone: '+77054121890',
    delivery_method: 'delivery', delivery_address: 'ул. Защитная, 12', total_amount: 5300, payment_method: 'kaspi_transfer', payment_status: 'pending',
    order_items: JSON.stringify([{ name: 'Пепперони', quantity: 1, price: 3200 }, { name: 'Картофель фри', quantity: 1, price: 1500 }]),
    pricing_snapshot: JSON.stringify({ breakdown: { subtotal: 4700, delivery_fee: 600, service_fee: 0 } }),
    comment: '', operator_note: null, cancellation_reason: null, operator_runs_delivery: true, couriers_enabled: false, payment_steps: false,
    workflow_state: 'COOKING', manual_payment_confirmation: true, order_source: 'app',
  };
  const patches: Record<string, unknown>[] = [];
  const courierCalls: string[] = [];
  await page.addInitScript(theme => {
    localStorage.setItem('app_lang', 'ru');
    localStorage.setItem('sortirovka-theme', theme);
    sessionStorage.setItem('dam_workstation_session', 'operator');
    sessionStorage.setItem('s24_welcome_done', '1');
    localStorage.setItem('dam_alem_order_alert_sound', 'off');
  }, THEME);
  await page.route('**/*', route => LOCAL.has(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
  await page.route('**/api/**', async route => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    let json: unknown = { items: [], total: 0 };
    if (path.endsWith('/modules')) json = { food: true, dam_alem: true };
    if (path.endsWith('/shifts/me')) json = { staff: { id: 1, name: 'Айжан', role: 'operator', pin_set: true }, shift: { id: 9, staff_name: 'Айжан', role: 'operator', active: true, opened_at: new Date().toISOString() } };
    if (path.endsWith('/business/me')) json = { role: 'operator', name: 'Айжан', couriers_enabled: false };
    if (path.endsWith('/couriers')) courierCalls.push(path);  // couriers are off: the cabinet must not ask for them
    if (path.endsWith('/business/today') || path.endsWith('/cashbox/dashboard')) return route.fulfill({ status: 503, json: { detail: 'Нет данных' } });
    if (path.endsWith('/operations/order-counts')) json = { all: 1, new: 0, working: 1, preparing: 1 };
    if (path.endsWith('/operations/orders')) json = { items: [order], total: 1 };
    if (path.endsWith('/operations/orders/1048')) {
      if (req.method() === 'PATCH') {
        const body = req.postDataJSON();
        patches.push(body);
        Object.assign(order, { status: body.status, version: order.version + 1 });
      }
      json = { order, events: [], delivery: null };
    }
    await route.fulfill({ json });
  });
  await page.goto('/partner/dam-alem/operator?section=orders&order=1048');
  const payment = page.getByRole('region', { name: 'Оплата заказа' });
  await expect(payment).toContainText('Оплата · При получении', { timeout: 30_000 });
  await expect(payment).toContainText('Kaspi переводом');
  await expect(page.getByText(/Выставьте счёт|Счёт выставлен|Выберите курьера/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Подтвердить получение оплаты|Оплата получена|Деньги пришли/ })).toHaveCount(0);
  const next = page.getByTestId('order-next-step');
  await expect(next).toHaveText('Готово');
  await shot(page, 'simple2-order-card', true);
  await next.click();
  await expect.poll(() => patches.length).toBe(1);
  expect(patches[0]).toEqual({ expected_version: 2, status: 'in_progress' });
  await expect(next).toHaveText('Доставлен');
  expect(courierCalls).toEqual([]);
});
