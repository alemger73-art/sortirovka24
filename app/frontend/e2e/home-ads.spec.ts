import { test, expect } from '@playwright/test';
const ads = [
  { id: 8, title: 'Сено в рулонах', ann_type: 'sell', price: '50000', status: 'approved', active: true, created_at: '2026-10-20T10:00:00Z', expires_at: '2099-01-01T00:00:00Z' },
  { id: 9, title: 'Требуется продавец', ann_type: 'job', price: '250000', status: 'approved', active: true, created_at: '2026-10-20T10:00:00Z', expires_at: '2099-01-01T00:00:00Z' },
  { id: 10, title: 'Отдам котёнка', ann_type: 'free', price: 'Бесплатно', status: 'approved', active: true, created_at: '2026-10-20T10:00:00Z', expires_at: '2099-01-01T00:00:00Z' },
];
for (const [name, w, h] of [['mobile', 390, 844], ['desktop', 1280, 900]] as const) {
  test(`home shows ads ${name}`, async ({ page }, info) => {
    await page.setViewportSize({ width: w, height: h });
    await page.addInitScript(() => { localStorage.setItem('app_lang', 'ru'); sessionStorage.setItem('s24_welcome_done', '1'); });
    await page.route('**/api/**', (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('/modules')) return route.fulfill({ json: { news: true, announcements: true, food: true, directory: true } });
      if (path.endsWith('/entities/announcements')) return route.fulfill({ json: { items: ads, total: 3 } });
      return route.fulfill({ json: { items: [], total: 0 } });
    });
    await page.goto('/');
    await expect(page.locator('.portal-hero-links a[href="/announcements"]')).toBeVisible();
    await expect(page.getByTestId('home-ad-post')).toBeVisible();
    await expect(page.getByText('Требуется продавец')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`home-${name}.png`), fullPage: true });
  });
}
