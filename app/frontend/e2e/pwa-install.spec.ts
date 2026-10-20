import { test, expect, type Page } from '@playwright/test';

const ANDROID = 'Mozilla/5.0 (Linux; Android 14; SM-A546B) AppleWebKit/537.36 (KHTML, like Gecko)';
const UA = {
  chrome: `${ANDROID} Chrome/129.0.0.0 Mobile Safari/537.36`,
  yandex: `${ANDROID} Chrome/128.0.0.0 YaBrowser/24.10.1.123.00 SA/3 Mobile Safari/537.36`,
  xiaomi: `${ANDROID} Chrome/112.0.5615.136 Mobile Safari/537.36 XiaoMi/MiuiBrowser/18.4.40711`,
};

async function open(page: Page, path: string) {
  const events: Record<string, unknown>[] = [];
  await page.route('**/*', r => new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort());
  await page.route('**/api/**', async r => {
    if (r.request().url().includes('/push/analytics')) events.push(r.request().postDataJSON());
    await r.fulfill({ json: { items: [], total: 0 } });
  });
  await page.goto(path);
  return events;
}

test.describe('android yandex', () => {
  test.use({ userAgent: UA.yandex, viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  test('banner shows by itself and «Установить» sends the page to Chrome', async ({ page }) => {
    const events = await open(page, '/');
    const banner = page.locator('[data-install-banner]');
    await expect(banner).toBeVisible();
    await banner.getByRole('button', { name: 'Установить' }).click();
    await expect.poll(() => events.some(e => e.event === 'pwa_open_in_chrome' && e.browser === 'yandex' && e.version === '24')).toBe(true);
  });
  test('without Chrome the page comes back with one short instruction', async ({ page }) => {
    const events = await open(page, '/?s24install=nochrome');
    await expect(page.getByText('На телефоне нет Chrome')).toBeVisible();
    await expect.poll(() => events.some(e => e.event === 'pwa_chrome_missing')).toBe(true);
    expect(page.url()).not.toContain('s24install');
  });
});

test.describe('android xiaomi browser', () => {
  test.use({ userAgent: UA.xiaomi, viewport: { width: 360, height: 760 }, serviceWorkers: 'block' });
  test('vendor browser is also sent to Chrome', async ({ page }) => {
    const events = await open(page, '/');
    await page.locator('[data-install-banner]').getByRole('button', { name: 'Установить' }).click();
    await expect.poll(() => events.some(e => e.event === 'pwa_open_in_chrome' && e.browser === 'vendor')).toBe(true);
  });
});

test.describe('android chrome', () => {
  test.use({ userAgent: UA.chrome, viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  test('arriving from another browser: one big button opens the system install window', async ({ page }) => {
    await page.addInitScript(() => {
      setTimeout(() => {
        const e = new Event('beforeinstallprompt') as Event & Record<string, unknown>;
        e.prompt = () => { (window as unknown as Record<string, number>).__prompted = 1; return Promise.resolve(); };
        e.userChoice = Promise.resolve({ outcome: 'accepted' });
        window.dispatchEvent(e);
      }, 500);
    });
    const events = await open(page, '/?s24install=1');
    const sheet = page.getByRole('dialog');
    await expect(sheet.getByRole('heading', { name: 'Установить «Сортировка 24»' })).toBeVisible();
    expect(page.url()).not.toContain('s24install');
    await sheet.getByRole('button', { name: 'Установить' }).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as Record<string, number>).__prompted)).toBe(1);
    await expect.poll(() => events.some(e => e.event === 'pwa_install_accepted')).toBe(true);
    await expect(sheet).toBeHidden();
  });
  test('chrome without install offer (already installed) shows no nagging banner', async ({ page }) => {
    await open(page, '/');
    await page.waitForTimeout(1500);
    await expect(page.locator('[data-install-banner]')).toHaveCount(0);
  });
});
