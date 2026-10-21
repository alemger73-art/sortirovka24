import { test, expect } from '@playwright/test';

// Home page circles link to /food?category=<slug>: the menu must open exactly on that section,
// even though the dishes arrive after the categories and photos above keep loading.
const cats = [
  { id: 1, name: 'Бургеры', slug: 'ufo' }, { id: 2, name: 'Пиццы', slug: 'pizza-30' },
  { id: 3, name: 'Закуски', slug: 'zakuski' }, { id: 4, name: 'Напитки', slug: 'napitki' },
];
const products = cats.flatMap((c) => Array.from({ length: 6 }, (_, i) => ({
  id: c.id * 100 + i, restaurant_id: 1, category_id: c.id, name: `${c.name} ${i + 1}`, description: 'Описание блюда', image_url: '/food-hero-reference.png',
  price: 1000 + i * 100, available: true, is_active: true, sellable: true, modifiers_enabled: false, modifier_groups: [],
})));

async function mock(page: import('@playwright/test').Page) {
  await page.route('**/*', route => { const url = new URL(route.request().url()); return url.hostname === '127.0.0.1' || url.pathname.includes('/api/') ? route.continue() : route.abort(); });
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown = { items: [], total: 0 };
    if (path.endsWith('/modules')) body = { food: true };
    if (path.includes('food_restaurants')) body = { items: [{ id: 1, name: 'DAM ALEM 2.0' }] };
    if (path.includes('food_items')) body = { items: products.map(p => ({ ...p, sort_order: p.id })) };
    if (path.includes('food_categories')) body = { items: cats.map((c, i) => ({ ...c, is_active: true, sort_order: i })) };
    if (path === '/api/v1/dam-alem/menu/catalog') {
      await new Promise(r => setTimeout(r, 900)); // dishes come later than categories
      body = { business_id: 'dam_alem', restaurant_id: 1, categories: cats, products, groups: [], options: [], links: [] };
    }
    if (path.includes('food_settings')) body = { items: Object.entries({ min_order_amount: '2000', kitchen_open: '00:00', kitchen_close: '00:00' }).map(([setting_key, setting_value]) => ({ setting_key, setting_value })) };
    await route.fulfill({ json: body });
  });
}

for (const [slug, name] of [['pizza-30', 'Пиццы'], ['napitki', 'Напитки']]) {
  test(`/food?category=${slug} opens the «${name}» section`, async ({ page }) => {
    await mock(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/food?category=${slug}`);
    const id = cats.find(c => c.slug === slug)!.id;
    const section = page.locator(`#dam-category-${id}`);
    await expect(section).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(3500);
    const pills = await page.locator('#dam-market-categories').boundingBox();
    const box = await section.boundingBox();
    // The section title sits right under the sticky chips, not somewhere above or below.
    expect(Math.abs(box!.y - (pills!.y + pills!.height))).toBeLessThan(40);
    await expect(section.getByRole('heading').first()).toContainText(name);
  });
}

test('tapping «Пиццы» on the home page lands on the pizza section, not the top of the menu', async ({ page }) => {
  await mock(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const circle = page.locator('.home-food a[href="/food?category=pizza-30"]');
  await expect(circle).toBeVisible({ timeout: 15000 });
  await circle.click();
  await expect(page).toHaveURL(/category=pizza-30/);
  const section = page.locator('#dam-category-2');
  await expect(section).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(3500);
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(200);
  const pills = await page.locator('#dam-market-categories').boundingBox();
  const box = await section.boundingBox();
  expect(Math.abs(box!.y - (pills!.y + pills!.height))).toBeLessThan(40);
});
