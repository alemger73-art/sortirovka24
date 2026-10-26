import { test, expect } from '@playwright/test';

// After a release the old page parts are gone from the server. A tap that needs one must not end on an
// error screen: the page reloads once by itself and opens the section.
test('a missing page part after a release reloads once and opens the section', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('app_lang', 'ru'); sessionStorage.setItem('s24_welcome_done', '1'); });
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/modules')) return route.fulfill({ json: { news: true, announcements: true } });
    return route.fulfill({ json: { items: [], total: 0 } });
  });
  let failed = 0;
  await page.route(/\/assets\/Announcements-[^/]+\.js$/, (route) => {
    if (failed === 0) { failed++; return route.fulfill({ status: 404, body: 'gone' }); }
    return route.continue();
  });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.locator('a[href="/announcements"]:visible').first().click();
  await expect(page).toHaveURL(/\/announcements$/);
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({ timeout: 15000 });
  expect(failed).toBe(1);
  await expect(page.getByText(/Что-то пошло не так|Бет жүктелмеді/)).toHaveCount(0);
});
