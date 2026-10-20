import { test, expect, type Page } from '@playwright/test';

async function setup(page: Page, auth: boolean) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(({ auth }) => {
    localStorage.setItem('app_lang', 'ru'); sessionStorage.setItem('s24_welcome_done', '1');
    if (auth) { localStorage.setItem('account_token', 't'); localStorage.setItem('account_user_profile', JSON.stringify({ id: 'a', name: 'Алем', phone: '+77001234567', role: 'user' })); }
  }, { auth });
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/modules')) return route.fulfill({ json: { food: true, announcements: true, news: true, transport: true, directory: true, inspectors: true, business: true, masters: false, complaints: false } });
    if (path.endsWith('/account/me')) return route.fulfill({ json: { id: 'a', name: 'Алем', phone: '+77001234567' } });
    return route.fulfill({ json: { items: [], total: 0 } });
  });
}

test('«Ещё»: account card with shortcuts, service tiles, no duplicates, disabled sections hidden', async ({ page }, info) => {
  await setup(page, true);
  await page.goto('/more');
  await expect(page.getByText('Алем', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Мои заказы' })).toHaveAttribute('href', '/cabinet?tab=orders');
  await expect(page.getByRole('link', { name: 'Мои объявления' })).toHaveAttribute('href', '/cabinet?tab=announcements');
  for (const name of ['Новости', 'Транспорт', 'Справочник', 'Участковые', 'Партнёры района', 'Для бизнеса', 'Написать в поддержку']) {
    await expect(page.locator('main').getByRole('link', { name: new RegExp(name) }).first()).toBeVisible();
  }
  await expect(page.locator('main').getByRole('link', { name: /Мастера|Жалобы жителей/ })).toHaveCount(0);
  await expect(page.locator('main a[href="/partners"]')).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('more-auth.png'), fullPage: true });
});

test('«Ещё» for a guest offers to sign in', async ({ page }, info) => {
  await setup(page, false);
  await page.goto('/more');
  await expect(page.locator('main').getByRole('link', { name: 'Войти' })).toHaveAttribute('href', '/login');
  await expect(page.getByRole('link', { name: 'Мои заказы' })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('more-guest.png'), fullPage: true });
});
