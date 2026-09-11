import { test, expect, type Page } from '@playwright/test';
import { foodBannerActionUrl, isFoodBanner, resolveFoodBannerAction, safeBannerLink } from '../src/lib/foodBannerActions';

type Banner = { id: number; title: string; subtitle?: string; button_url: string; banner_type: string; active: boolean; image_url?: string; button_text?: string };
const image = 'http://127.0.0.1:3174/food-hero-reference.png';
async function setup(page: Page, initial: Banner[] = []) {
  const state = { banners: initial, writes: 0, failNext: false };
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' || route.request().url().includes('/api/') ? route.continue() : route.abort());
  await page.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    let body: unknown = { items: [], total: 0 };
    if (path.includes('verify-session')) body = { valid: true, login: 'test', display_name: 'Алем Фуд' };
    if (path.includes('food_restaurants')) body = { items: [{ id: 1, name: 'Алем Фуд' }] };
    const categories = [{ id: 1, name: 'Пицца', slug: 'pizza', restaurant_id: 1 }, { id: 2, name: 'Напитки', slug: 'napitki', restaurant_id: 1 }];
    if (path === '/api/categories') body = { categories };
    if (path.includes('/entities/food_categories')) body = { items: categories };
    if (path === '/api/products') body = { products: [{ id: 1, category_id: 1, title: 'Маргарита', description: 'Моцарелла и томаты', price: 2500, image, available: true }, { id: 2, category_id: 2, title: 'Лимонад', price: 600, image, available: true }] };
    if (path.includes('food_settings')) body = { items: Object.entries({ promo_codes: JSON.stringify([{ code: 'TEST10', type: 'percent', value: 10, active: true, min_order: 0 }]), loyalty_gifts: '[]', min_order_amount: '0', kitchen_open: '00:00', kitchen_close: '00:00' }).map(([setting_key, setting_value]) => ({ setting_key, setting_value })) };
    if (path.includes('validate-promo')) body = { valid: true, code: 'TEST10', discount: 250, free_delivery: false, label: 'Скидка 10%' };
    if (path.startsWith('/api/v1/entities/banners')) {
      if (request.method() === 'GET') {
        const query = JSON.parse(url.searchParams.get('query') || '{}');
        body = { items: [...state.banners].filter(b => !query.active || b.active).sort((a, b) => b.id - a.id), total: state.banners.length };
      } else {
        state.writes++;
        if (state.failNext) { state.failNext = false; await route.fulfill({ status: 500, json: { detail: 'Не удалось сохранить баннер' } }); return; }
        const id = Number(path.split('/').pop());
        if (request.method() === 'POST') { const entry = { ...request.postDataJSON(), id: Math.max(0, ...state.banners.map(b => b.id)) + 1 }; state.banners.push(entry); body = entry; }
        if (request.method() === 'PUT') { const entry = state.banners.find(b => b.id === id)!; Object.assign(entry, request.postDataJSON()); body = entry; }
        if (request.method() === 'DELETE') { state.banners = state.banners.filter(b => b.id !== id); body = { success: true }; }
      }
    }
    if (path === '/api/v1/storage/public/download-url') body = { download_url: image };
    await route.fulfill({ json: body });
  });
  return state;
}

test('actions are explicit, query and hash agree, unsafe links are rejected', () => {
  expect(resolveFoodBannerAction({ title: 'Семейный сет со скидкой 10%' })).toEqual({ type: 'menu' });
  expect(resolveFoodBannerAction({ button_url: '/food?promo=test10&category=pizza' })).toEqual({ type: 'promo', code: 'TEST10', categorySlug: 'pizza' });
  expect(resolveFoodBannerAction({ link_url: '/food#category=pizza' })).toEqual({ type: 'category', slug: 'pizza' });
  for (const type of ['menu', 'popular', 'gifts'] as const) expect(resolveFoodBannerAction({ button_url: foodBannerActionUrl({ type }) })).toEqual({ type });
  for (const url of ['javascript:alert(1)', '//evil.example', '/\\evil.example', 'https://user:pass@site.test', ' https://site.test']) expect(safeBannerLink(url)).toBe(false);
  expect(isFoodBanner({ title: 'Доставка аптеки', banner_type: 'promo', button_url: '/apteka' })).toBe(false);
  expect(isFoodBanner({ title: 'Наша акция', banner_type: 'food_delivery', button_url: 'https://example.com' })).toBe(true);
});

test('all banners are reachable, category and promo clicks work, search stays focused', async ({ page }, info) => {
  await setup(page, [
    { id: 1, title: 'Пицца для вечера', subtitle: 'Выберите любимый вкус', button_url: '/food#category=pizza', banner_type: 'food_delivery', active: true, image_url: image },
    { id: 2, title: 'Свежие напитки', button_url: '/food?category=napitki', banner_type: 'food_delivery', active: true },
    { id: 3, title: 'Скидка на заказ', subtitle: '10% по промокоду TEST10', button_url: '/food#promo=TEST10', banner_type: 'food_delivery', active: true },
    { id: 4, title: 'Выбор гостей', button_url: '/food#popular', banner_type: 'food_delivery', active: true },
    { id: 5, title: 'Что приготовить сегодня?', button_url: '/food', banner_type: 'food_delivery', active: true },
    { id: 6, title: 'Черновик акции', button_url: '/food', banner_type: 'food_delivery', active: false },
    { id: 7, title: 'Аптека', button_url: '/apteka', banner_type: 'promo', active: true },
  ]);
  await page.goto('/food', { waitUntil: 'domcontentloaded' });
  const track = page.getByTestId('food-banner-track');
  await expect(track.locator('.food-campaign')).toHaveCount(5);
  await expect(page.getByTestId('food-banner-6')).toHaveCount(0);
  await expect(page.getByTestId('food-banner-7')).toHaveCount(0);
  await page.getByRole('button', { name: 'Следующие предложения' }).click();
  await expect.poll(() => track.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
  await page.getByTestId('food-banner-1').click();
  await expect(page.locator('#dam-category-1 h2')).toBeInViewport();
  await page.getByTestId('food-banner-3').click();
  await expect(page.getByText('Промокод TEST10 применён', { exact: true })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Найти блюдо' }).fill('Лимонад');
  await expect(track).toHaveCount(0);
  await expect(page.locator('.dam-market-offer')).toHaveCount(0);
  await page.getByRole('button', { name: 'Очистить поиск' }).click();
  await expect(track).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({ path: info.outputPath('food-banners.png'), fullPage: true, animations: 'disabled' });
});

test('admin creates a draft, edits, publishes, reloads storefront, hides and deletes', async ({ page }, info) => {
  const state = await setup(page);
  await page.addInitScript(() => localStorage.setItem('_partner_token_dam_alem', 'test-session'));
  await page.goto('/partner/dam-alem', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Баннеры', exact: true }).click();
  await page.getByRole('button', { name: 'Создать баннер', exact: true }).click();
  await page.getByLabel('Что произойдёт при нажатии').selectOption('category');
  await page.getByLabel('Категория', { exact: true }).selectOption('pizza');
  await page.getByLabel('Заголовок', { exact: true }).fill('Вечер с пиццей');
  await page.getByLabel('Подзаголовок и условия').fill('Выберите вкус и добавьте любимый напиток');
  await page.screenshot({ path: info.outputPath('banner-editor.png'), fullPage: true, animations: 'disabled' });
  // Failure must keep the form open and must not retry POST automatically.
  state.failNext = true;
  await page.getByRole('button', { name: 'Сохранить черновик' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible();
  expect(state.writes).toBe(1);
  await page.getByRole('button', { name: 'Сохранить черновик' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(state.banners[0]).toMatchObject({ active: false, button_url: '/food#category=pizza', banner_type: 'food_delivery' });
  await page.getByRole('button', { name: 'Редактировать Вечер с пиццей' }).click();
  await page.getByLabel('Заголовок', { exact: true }).fill('Пицца на двоих');
  await page.getByLabel('Показывать на витрине').check();
  await page.getByRole('button', { name: 'Сохранить и показать' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(state.banners[0].active).toBe(true);
  await page.goto('/food', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('food-banner-1')).toContainText('Пицца на двоих');
  await page.getByTestId('food-banner-1').click();
  await expect(page.locator('#dam-category-1 h2')).toBeInViewport();
  await page.goto('/partner/dam-alem', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Баннеры', exact: true }).click();
  await page.getByRole('button', { name: 'Скрыть баннер Пицца на двоих' }).click();
  await expect(page.getByRole('button', { name: 'Показать баннер Пицца на двоих' })).toBeVisible();
  await page.getByRole('button', { name: 'Копировать Пицца на двоих' }).click();
  await expect(page.getByLabel('Заголовок', { exact: true })).toHaveValue('Пицца на двоих — копия');
  await expect(page.getByLabel('Показывать на витрине')).not.toBeChecked();
  await page.getByRole('button', { name: 'Отмена', exact: true }).click();
  await page.getByRole('button', { name: 'Удалить Пицца на двоих', exact: true }).click();
  await page.getByRole('button', { name: 'Удалить баннер', exact: true }).click();
  await expect(page.getByTestId('admin-banner-1')).toHaveCount(0);
  expect(state.banners).toHaveLength(0);
});
