import { test, expect } from '@playwright/test';
const ads = [
  { id: 8, title: 'Сено в рулонах', ann_type: 'sell', price: '50000', status: 'approved', active: true, created_at: '2026-10-20T10:00:00Z', expires_at: '2099-01-01T00:00:00Z' },
  { id: 9, title: 'Требуется продавец', ann_type: 'job', price: '250000', status: 'approved', active: true, created_at: '2026-10-20T10:00:00Z', expires_at: '2099-01-01T00:00:00Z' },
  { id: 10, title: 'Отдам котёнка', ann_type: 'free', price: 'Бесплатно', status: 'approved', active: true, created_at: '2026-10-20T10:00:00Z', expires_at: '2099-01-01T00:00:00Z' },
];
for (const [name, w, h, theme] of [['mobile', 390, 844, 'dark'], ['mobile-light', 390, 844, 'light'], ['desktop', 1280, 900, 'dark'], ['desktop-light', 1280, 900, 'light']] as const) {
  test(`home shows ads ${name}`, async ({ page }, info) => {
    await page.setViewportSize({ width: w, height: h });
    await page.addInitScript((theme) => { localStorage.setItem('sortirovka-theme', theme); localStorage.setItem('app_lang', 'ru'); sessionStorage.setItem('s24_welcome_done', '1'); }, theme);
    await page.route('**/api/**', (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('/modules')) return route.fulfill({ json: { news: true, announcements: true, food: true, directory: true } });
      if (path.endsWith('/entities/announcements')) return route.fulfill({ json: { items: ads, total: 3 } });
      if (path.endsWith('/entities/banners')) return route.fulfill({ json: { items: [
        { id: 12, banner_type: 'food_delivery', active: true, title: 'Орбита Чикен', button_text: 'В корзину', button_url: '/food#product=217' },
        { id: 1, banner_type: 'shop', active: true, title: 'DAM ALEM — Доставка еды', button_url: '/food' }], total: 2 } });
      if (path.endsWith('/entities/food_categories')) return route.fulfill({ json: { items: [{ id: 31, slug: 'ufo', name: 'UFO Бургеры', is_active: true }, { id: 10, slug: 'pizza-30', name: 'Пиццы', is_active: true }], total: 2 } });
      if (path.endsWith('/entities/food_items')) return route.fulfill({ json: { items: [
        { id: 187, name: 'Пепперони', price: 3200, category_id: 10, is_active: true, image_url: 'food/p.webp' },
        { id: 217, name: 'Орбита Чикен', price: 3700, category_id: 31, is_active: true, image_url: 'food/o.webp' },
        { id: 225, name: 'UFO Дуэт Комбо', price: 7200, category_id: 31, is_active: true, image_url: 'food/c.webp' }], total: 3 } });
      if (path.endsWith('/entities/food_items/217')) return route.fulfill({ json: { id: 217, name: 'Орбита Чикен', price: 3700, is_active: true, available: true } });
      return route.fulfill({ json: { items: [], total: 0 } });
    });
    await page.goto('/');
    await expect(page.locator('.h2-tiles a[href="/announcements"]')).toBeVisible();
    await expect(page.locator('.h2-tiles a')).toHaveCount(3);
    await expect(page.getByTestId('home-ad-post')).toBeVisible();
    await expect(page.getByText('Требуется продавец')).toBeVisible();
    await expect(page.locator('.home-food')).toContainText('3 700 ₸');
    await expect(page.locator('.home-food nav')).toContainText('Пиццы');
    await expect(page.locator('.home-food a[href="/food?category=pizza-30"]')).toBeVisible();
    // The combo is the big card; then the banner dish, then the rest of the menu.
    expect(await page.locator('.home-food a[href^="/food#product="]').evaluateAll((a) => a.map((x) => x.getAttribute('href')))).toEqual(['/food#product=225', '/food#product=217', '/food#product=187']);
    // No floating call button over the content any more.
    await expect(page.locator('a.fixed[href^="tel:"]')).toHaveCount(0);
    await expect(page.locator('.home-ads nav a')).toHaveCount(4);
    // No repeated blocks: hero already has these sections.
    await expect(page.getByRole('heading', { name: 'Популярные категории' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Быстрые действия' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Магазины района' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Спецпредложения' })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`home-${name}.png`), fullPage: true });
  });
}
