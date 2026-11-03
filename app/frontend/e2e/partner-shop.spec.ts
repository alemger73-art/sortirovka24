import { test, expect, type Page } from '@playwright/test';

const shop = {
  slug: 'magazin-cvetok', name: 'Magazin.cvetok', headline: 'Комнатные цветы с доставкой', logo: '', accent: '#2f5a34', hours: 'Ежедневно 10:00–19:00',
  delivery: [{ name: 'Сортировка', price: 'бесплатно' }, { name: 'Город', price: 'inDrive за счёт покупателя' }],
  categories: ['Цветущие', 'Кактусы'], delivery_note: 'Оплата магазину при получении.',
  products: [
    { sku: '10001', category: 'Цветущие', name: 'Орхидея фаленопсис', height_cm: 37, pot_cm: 8, price: 4900, image: null },
    { sku: '40001', category: 'Кактусы', name: 'Кактус', height_cm: 7, pot_cm: 5, price: 1800, image: null },
  ],
};

async function setup(page: Page) {
  const orders: unknown[] = [];
  await page.addInitScript(() => localStorage.setItem('app_lang', 'ru'));
  await page.route('**/*', r => new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort());
  await page.route('**/api/**', async r => {
    const path = new URL(r.request().url()).pathname;
    if (path.endsWith('/shops/magazin-cvetok/orders')) {
      const body = r.request().postDataJSON();
      orders.push(body);
      return r.fulfill({ status: 201, json: { id: 57, total: 4900 * 2 + 1800, notified: 1 } });
    }
    if (path.endsWith('/shops/magazin-cvetok')) return r.fulfill({ json: shop });
    if (path.endsWith('/modules')) return r.fulfill({ json: { business: true } });
    return r.fulfill({ json: { items: [], total: 0 } });
  });
  return orders;
}

test('a resident filters the catalog, fills the cart and sends the order to the shop', async ({ page }) => {
  const orders = await setup(page);
  await page.goto('/shop/magazin-cvetok');
  await expect(page.getByRole('heading', { name: 'Magazin.cvetok' })).toBeVisible();
  await expect(page.getByText('высота 37 см · горшок ⌀8 см')).toBeVisible();

  await page.getByRole('button', { name: 'Кактусы', exact: true }).click();
  await expect(page.getByText('Орхидея фаленопсис')).toHaveCount(0);
  await page.getByRole('button', { name: 'В корзину' }).click();
  await page.getByRole('button', { name: 'Все', exact: true }).click();
  await page.getByRole('article').filter({ hasText: 'Орхидея' }).getByRole('button', { name: 'В корзину' }).click();
  await page.getByRole('button', { name: 'Добавить ещё Орхидея фаленопсис' }).click();
  await expect(page.getByRole('button', { name: /Корзина · 3/ })).toContainText('11 600');

  await page.getByRole('button', { name: /Корзина · 3/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Оформление заказа' });
  await dialog.getByLabel('Имя').fill('Айгерим');
  await dialog.getByLabel('Телефон').fill('+7 707 000 00 00');
  await dialog.getByLabel('Район доставки').selectOption('Сортировка');
  await expect(dialog.getByText('Доставка: бесплатно')).toBeVisible();
  await dialog.getByLabel('Адрес').fill('Ерубаева 12, кв 40');
  await dialog.getByRole('button', { name: /Отправить заказ/ }).click();

  await expect(dialog.getByText('Заказ №57 на 11 600 ₸ передан в Magazin.cvetok')).toBeVisible();
  expect(orders).toEqual([{ name: 'Айгерим', phone: '+7 707 000 00 00', address: 'Ерубаева 12, кв 40', zone: 'Сортировка', wanted: '', comment: '',
    items: expect.arrayContaining([{ sku: '40001', qty: 1 }, { sku: '10001', qty: 2 }]) }]);
  await expect(page.getByRole('button', { name: /Корзина ·/ })).toHaveCount(0);
});

test('a product card opens with its photo, care hints and description', async ({ page }) => {
  shop.products[0] = { ...shop.products[0], description: 'Цветёт несколько месяцев подряд.', light: 'diffused', water: 'moderate', easy: false } as typeof shop.products[0];
  await setup(page);
  await page.goto('/shop/magazin-cvetok');
  await page.getByRole('button', { name: 'Подробнее: Орхидея фаленопсис' }).click();
  const sheet = page.getByRole('dialog', { name: 'Орхидея фаленопсис' });
  await expect(sheet.getByText('Светло, без прямого солнца')).toBeVisible();
  await expect(sheet.getByText('Цветёт несколько месяцев подряд.')).toBeVisible();
  await sheet.getByRole('button', { name: 'В корзину · 4 900 ₸' }).click();
  await sheet.getByRole('button', { name: 'Перейти в корзину' }).click();
  await expect(page.getByRole('dialog', { name: 'Оформление заказа' })).toContainText('Орхидея фаленопсис');
});

test('the partner signs in from the Telegram link, takes an order and changes a price', async ({ page }) => {
  const calls: { path: string; body: unknown; auth: string | null }[] = [];
  const order = { id: 7, items: [{ sku: '10001', name: 'Орхидея фаленопсис', price: 4900, qty: 1 }], total: 4900, name: 'Айгерим',
    phone: '+77070000000', address: 'Ерубаева 12', zone: 'Сортировка', wanted: '', comment: 'на подарок', status: 'new', accepted_by: '', created_at: '2026-11-03T08:00:00+00:00' };
  await page.route('**/*', r => new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort());
  await page.route('**/api/**', async r => {
    const path = new URL(r.request().url()).pathname;
    calls.push({ path, body: r.request().postDataJSON(), auth: r.request().headers().authorization || null });
    if (path.endsWith('/cabinet/login')) return r.fulfill({ json: { token: 'tok', name: 'Magazin.cvetok' } });
    if (path.endsWith('/cabinet/orders/7/status')) return r.fulfill({ json: { ...order, status: 'accepted', accepted_by: 'Айгуль' } });
    if (path.endsWith('/cabinet/products/10001')) return r.fulfill({ json: { ...shop.products[0], price: 5200, active: true } });
    if (path.endsWith('/shops/magazin-cvetok/cabinet')) return r.fulfill({ json: {
      slug: 'magazin-cvetok', name: 'Magazin.cvetok', enabled: true, accent: '#2f5a34', logo: '', hours: '', headline: '',
      statuses: { new: 'Новый', accepted: 'Принят', done: 'Выполнен', cancelled: 'Отменён' },
      stats: { new: 1, month_orders: 1, month_total: 4900 }, orders: [order],
      products: shop.products.map(p => ({ ...p, active: true })), telegram: [{ name: 'Айгуль', linked_at: '2026-11-03T07:00:00+00:00' }] } });
    if (path.endsWith('/modules')) return r.fulfill({ json: { business: true } });
    return r.fulfill({ json: { items: [], total: 0 } });
  });
  await page.goto('/shop/magazin-cvetok/cabinet#code=one-time-code-123');
  await expect(page.getByRole('heading', { name: 'Magazin.cvetok' })).toBeVisible();
  expect(page.url()).not.toContain('code=');
  expect(calls.find(c => c.path.endsWith('/login'))?.body).toEqual({ code: 'one-time-code-123' });
  await expect(page.getByText('+77070000000')).toBeVisible();
  await page.getByRole('button', { name: 'Принять' }).click();
  await expect(page.getByText('Принят · Айгуль')).toBeVisible();
  expect(calls.find(c => c.path.endsWith('/status'))).toMatchObject({ body: { status: 'accepted' }, auth: 'Shop tok' });

  await page.getByRole('button', { name: 'Товары' }).click();
  const price = page.getByLabel('Цена Орхидея фаленопсис');
  await price.fill('5200');
  await price.blur();
  await expect(page.getByText('Сохранено')).toBeVisible();
  expect(calls.find(c => c.path.endsWith('/products/10001'))?.body).toEqual({ price: 5200 });
});

test('a signed-in resident finds name, phone and home address already filled in', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('account_token', 'resident-token');
    localStorage.setItem('account_user_profile', JSON.stringify({ id: 5, name: 'Алем', phone: '+77001234567' }));
    localStorage.setItem('s24_shop_cart_magazin-cvetok', JSON.stringify({ '40001': 1 }));
  });
  await setup(page);
  await page.route('**/api/v1/account/me', r => r.fulfill({ json: { id: 5, name: 'Алем', phone: '+77001234567', email: '' } }));
  await page.route('**/api/v1/account/me/addresses', r => r.fulfill({ json: [
    { id: 1, address: 'Ермекова 3, кв 7', is_default: false }, { id: 2, address: 'Ерубаева 12, кв 40', is_default: true }] }));
  await page.goto('/shop/magazin-cvetok');
  await page.getByRole('button', { name: /Корзина · 1/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Оформление заказа' });
  await expect(dialog.getByLabel('Имя')).toHaveValue('Алем');
  await expect(dialog.getByLabel('Телефон')).toHaveValue('+77001234567');
  await expect(dialog.getByLabel('Адрес')).toHaveValue('Ерубаева 12, кв 40');
});
