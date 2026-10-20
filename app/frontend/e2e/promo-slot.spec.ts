import { test, expect, type Page } from '@playwright/test';

const partner = { slug: 'krovlya-365', name: 'Кровля 365', headline: 'Крыша, фасад и водостоки — от замера до готовой работы', offer: 'Замер бесплатно', phone: '+77000182112', whatsapp: '+77000182112', cover: '', logo: '', published: true, services: [], works: [] };
const news = Array.from({ length: 8 }, (_, i) => ({ id: i + 1, title: i === 0 ? 'Ремонт кровли школы начался' : `Новость ${i + 1}`, category: 'Сортировка', published: true, created_at: '2026-10-20T10:00:00Z', content: 'Текст новости' }));

async function setup(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => { localStorage.setItem('app_lang', 'ru'); sessionStorage.setItem('s24_welcome_done', '1'); });
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/modules')) return route.fulfill({ json: { news: true, announcements: true, food: true, business: true } });
    if (path.endsWith('/partners')) return route.fulfill({ json: { items: [partner] } });
    if (path.endsWith('/entities/food_categories')) return route.fulfill({ json: { items: [{ id: 31, slug: 'ufo', is_active: true }, { id: 10, slug: 'pizza-30', is_active: true }, { id: 34, slug: 'coffee', is_active: true }], total: 3 } });
    if (path.endsWith('/entities/food_items')) return route.fulfill({ json: { items: [
      { id: 217, name: 'Орбита Чикен', price: 3700, category_id: 31, is_active: true, image_url: 'food/o.webp' },
      { id: 187, name: 'Пепперони', price: 3200, category_id: 10, is_active: true, image_url: 'food/p.webp' },
      { id: 219, name: 'Кофе Латте', price: 1000, category_id: 34, is_active: true, image_url: 'food/l.webp' }], total: 3 } });
    if (/\/entities\/news\/1$/.test(path)) return route.fulfill({ json: news[0] });
    if (path.endsWith('/entities/news')) return route.fulfill({ json: { items: news, total: news.length } });
    return route.fulfill({ json: { items: [], total: 0 } });
  });
}

test('news about roofing shows the roofing partner once, × hides it for 3 days', async ({ page }, info) => {
  await setup(page);
  await page.goto('/news/1');
  const card = page.locator('[data-promo]');
  await expect(card).toHaveCount(1);
  await expect(card).toHaveAttribute('data-promo', 'partner');
  await expect(card).toContainText('Кровля 365');
  await expect(card.getByRole('link', { name: 'Позвонить' })).toHaveAttribute('href', /tel:/);
  await card.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('news-partner.png') });
  await card.getByRole('button', { name: 'Скрыть' }).click();
  await expect(page.locator('[data-promo]')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Ремонт кровли школы начался' })).toBeVisible();
  // Partner is hidden for 3 days → the food card may take its place, but never the partner.
  await expect(page.locator('[data-promo="partner"]')).toHaveCount(0);
});

test('food card shows a real dish with price; news list has exactly one promo', async ({ page }, info) => {
  await setup(page);
  await page.addInitScript(() => localStorage.setItem('s24_promo_hidden', JSON.stringify({ partner: Date.now() + 864e5 })));
  await page.goto('/news');
  await expect(page.locator('[data-promo]')).toHaveCount(1);
  const card = page.locator('[data-promo="dam"]');
  await expect(card).toContainText('DAM ALEM');
  await expect(card).toContainText(/₸/);
  await expect(card.getByRole('link', { name: /Заказать/ })).toHaveAttribute('href', /\/food#product=\d+/);
  await card.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('news-dam.png') });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('home: news strip like the ads strip, with «Все новости» at the end', async ({ page }) => {
  await setup(page);
  await page.goto('/');
  const strip = page.locator('.home-news');
  await expect(strip.getByRole('link', { name: /Ремонт кровли школы начался/ })).toBeVisible();
  await expect(strip.locator('a[href^="/news/"]')).toHaveCount(8);
  await expect(strip.locator('a[href="/news"]').last()).toContainText('Все новости');
});
