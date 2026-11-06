import { test, expect, type Page } from '@playwright/test';

const ANDROID = 'Mozilla/5.0 (Linux; Android 14; SM-A546B) AppleWebKit/537.36 (KHTML, like Gecko)';
const UA = {
  chrome: `${ANDROID} Chrome/129.0.0.0 Mobile Safari/537.36`,
  yandex: `${ANDROID} Chrome/128.0.0.0 YaBrowser/24.10.1.123.00 SA/3 Mobile Safari/537.36`,
  xiaomi: `${ANDROID} Chrome/112.0.5615.136 Mobile Safari/537.36 XiaoMi/MiuiBrowser/18.4.40711`,
};

async function open(page: Page, path: string) {
  const events: Record<string, unknown>[] = [];
  // These cases are about installing: the guest's registration offer (welcome-bonus.spec) is put off.
  await page.addInitScript(() => localStorage.setItem('s24_welcome_hidden_until', String(Date.now() + 86_400_000)));
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

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko)';
const IOS = {
  safari26: `${IPHONE} Version/26.0 Mobile/15E148 Safari/604.1`,
  safari17: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  chrome: `${IPHONE} CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1`,
  instagram: `${IPHONE} Mobile/15E148 Instagram 350.0.0.29.104 (iPhone15,2; iOS 18_6; ru_RU; ru)`,
  webview: `${IPHONE} Mobile/15E148`,
  yandex: `${IPHONE} Version/18.0 YaBrowser/24.10.5.414.10 SA/3 Mobile/15E148 Safari/604.1`,
};

async function iosHelp(page: Page) {
  await open(page, '/');
  await page.locator('[data-install-banner]').getByRole('button', { name: 'Установить' }).click();
  return page.getByRole('dialog');
}

for (const [name, ua, first] of [
  ['safari 26 (iOS 26): «•••» then «Поделиться»', IOS.safari26, '«•••» в строке адреса внизу'],
  ['safari 17: «Поделиться» at the bottom', IOS.safari17, '«Поделиться» внизу экрана'],
  ['chrome on iPhone: share in the address bar', IOS.chrome, 'справа в адресной строке'],
] as const) {
  test.describe(`iphone ${name}`, () => {
    test.use({ userAgent: ua, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: 'block' });
    test('steps for this browser, then «На экран „Домой“» and «Добавить»', async ({ page }) => {
      const help = await iosHelp(page);
      await expect(help.getByText(first)).toBeVisible();
      await expect(help.getByText('«На экран „Домой“»')).toBeVisible();
      await expect(help.getByText('Нажмите «Добавить»')).toBeVisible();
      await expect(help.getByText('Скопировать ссылку')).toHaveCount(0);
    });
  });
}

for (const [name, ua, inApp] of [['instagram', IOS.instagram, true], ['telegram/whatsapp web view', IOS.webview, true], ['yandex', IOS.yandex, false]] as const) {
  test.describe(`iphone ${name}`, () => {
    test.use({ userAgent: ua, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: 'block', permissions: ['clipboard-read', 'clipboard-write'] });
    test('asks to open the site in Safari and copies the link', async ({ page }) => {
      const help = await iosHelp(page);
      await expect(help.getByText('Открыть в Safari')).toHaveCount(inApp ? 1 : 0);
      await expect(help.getByText(inApp ? 'внутри другого приложения' : 'удобнее всего из Safari')).toBeVisible();
      await help.getByRole('button', { name: 'Скопировать ссылку для Safari' }).click();
      await expect(help.getByText('Ссылка скопирована')).toBeVisible();
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('http://127.0.0.1:3174/');
    });
  });
}

test.describe('android instagram web view', () => {
  test.use({ userAgent: `Mozilla/5.0 (Linux; Android 14; SM-A546B; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.0.0 Mobile Safari/537.36 Instagram 350.0.0.0.0 Android`, viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  test('in-app window is sent to Chrome', async ({ page }) => {
    const events = await open(page, '/');
    await page.locator('[data-install-banner]').getByRole('button', { name: 'Установить' }).click();
    await expect.poll(() => events.some(e => e.event === 'pwa_open_in_chrome' && e.embedded === true)).toBe(true);
  });
});

test.describe('android: window opened from WhatsApp/Telegram (no install offer)', () => {
  test.use({ userAgent: UA.chrome, viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  test('«Установить» in «Ещё» opens the page in full Chrome', async ({ page }) => {
    const events = await open(page, '/more');
    await page.locator('[data-install-banner]').getByRole('button', { name: 'Установить' }).click();
    await expect.poll(() => events.some(e => e.event === 'pwa_open_in_chrome' && e.browser === 'chrome')).toBe(true);
  });
  test('a second tap in the same window explains the menu instead of looping', async ({ page }) => {
    await page.addInitScript(() => sessionStorage.setItem('s24_chrome_tried', '1'));
    const events = await open(page, '/more');
    await page.locator('[data-install-banner]').getByRole('button', { name: 'Установить' }).click();
    await expect(page.getByRole('dialog')).toContainText('Если вверху крестик');
    expect(events.some(e => e.event === 'pwa_open_in_chrome')).toBe(false);
  });
});
