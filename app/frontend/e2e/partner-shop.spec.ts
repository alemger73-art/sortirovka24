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
