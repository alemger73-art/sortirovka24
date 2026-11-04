import { test, expect, type Page } from '@playwright/test';

/** Agreeing to the notifications card (its text names news and offers) subscribes the device with news and
 *  offers switched on; asking again waits a week after «×». Browser push is stubbed: no real push service. */
/** A signed-in resident whose browser can push (stubbed); registrations land in `registered`. */
async function stubPush(page: Page, registered: unknown[]) {
  await page.addInitScript(() => {
    localStorage.setItem('app_lang', 'ru');
    localStorage.setItem('account_token', 'resident-token');
    localStorage.setItem('account_user_profile', JSON.stringify({ id: 5, name: 'Алем', phone: '+77001234567' }));
    const subscription = { endpoint: 'https://push.example/1', toJSON: () => ({ endpoint: 'https://push.example/1', keys: { p256dh: 'k', auth: 'a' } }) };
    const pushManager = { getSubscription: async () => null, subscribe: async () => subscription };
    const registration = { pushManager };
    Object.defineProperty(window, 'PushManager', { value: function PushManager() {}, configurable: true });
    Object.defineProperty(navigator, 'serviceWorker', { value: { ready: Promise.resolve(registration), register: async () => registration, getRegistration: async () => registration, addEventListener() {} }, configurable: true });
    let permission = 'default';
    const N = function Notification() {} as unknown as { permission: string; requestPermission: () => Promise<string> };
    Object.defineProperty(N, 'permission', { get: () => permission });
    N.requestPermission = async () => { permission = 'granted'; return permission; };
    Object.defineProperty(window, 'Notification', { value: N, configurable: true });
  });
  await page.route('**/*', r => new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort());
  await page.route('**/api/**', async r => {
    const path = new URL(r.request().url()).pathname;
    if (path.endsWith('/push/web-key')) return r.fulfill({ json: { enabled: true, public_key: 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U' } });
    if (path.endsWith('/push/register-web')) { registered.push(r.request().postDataJSON()); return r.fulfill({ json: { success: true, registered: true } }); }
    if (path.endsWith('/account/me')) return r.fulfill({ json: { id: 5, name: 'Алем', phone: '+77001234567', email: '' } });
    if (path.endsWith('/account/cabinet')) return r.fulfill({ json: { profile: { id: 5, name: 'Алем', phone: '+77001234567' }, bonuses: [], orders: [], complaints: [], announcements: [], real_estate: [], master_requests: [], become_master_requests: [], addresses: [], settings: { language: 'ru' } } });
    if (path.endsWith('/modules')) return r.fulfill({ json: { food: true, business: true, announcements: true, directory: true } });
    return r.fulfill({ json: { items: [], total: 0 } });
  });
}

test('the welcome card subscribes the device with news and offers on', async ({ page }) => {
  const registered: unknown[] = [];
  await stubPush(page, registered);
  await page.goto('/cabinet');
  const card = page.getByText('Заказы и бонусы, а ещё новости района, новые магазины и акции', { exact: false });
  await expect(card).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: 'Включить уведомления' }).click();
  await expect.poll(() => registered.length).toBe(1);
  expect((registered[0] as { preferences: { news: boolean; marketing: boolean; orders: boolean } }).preferences)
    .toMatchObject({ news: true, marketing: true, orders: true });
});

test('on an iPhone in Safari the card explains that the app must be added to the home screen', async ({ browser }) => {
  const context = await browser.newContext({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1', viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.addInitScript(() => {
    localStorage.setItem('app_lang', 'ru');
    localStorage.setItem('account_token', 'resident-token');
    localStorage.setItem('account_user_profile', JSON.stringify({ id: 5, name: 'Алем', phone: '+77001234567' }));
  });
  await page.route('**/*', r => new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort());
  await page.route('**/api/**', async r => {
    const path = new URL(r.request().url()).pathname;
    if (path.endsWith('/account/me')) return r.fulfill({ json: { id: 5, name: 'Алем', phone: '+77001234567', email: '' } });
    if (path.endsWith('/account/cabinet')) return r.fulfill({ json: { profile: { id: 5, name: 'Алем' }, bonuses: [], orders: [], complaints: [], announcements: [], real_estate: [], master_requests: [], become_master_requests: [], addresses: [], settings: { language: 'ru' } } });
    if (path.endsWith('/modules')) return r.fulfill({ json: { food: true } });
    return r.fulfill({ json: { items: [], total: 0 } });
  });
  await page.goto('/cabinet');
  await expect(page.getByText('На iPhone уведомления приходят, только если установить «Сортировка 24» на экран «Домой».')).toBeVisible({ timeout: 15000 });
  await context.close();
});

test('«Уведомления» in the cabinet always offers to switch push on, even after the card was closed', async ({ page }) => {
  const registered: unknown[] = [];
  await stubPush(page, registered);
  await page.addInitScript(() => localStorage.setItem('s24_push_prompt_dismissed_at', String(Date.now())));
  await page.goto('/cabinet?tab=notifications');
  const status = page.locator('[data-push-status="disabled"]');
  await expect(status).toBeVisible({ timeout: 15000 });
  await status.getByRole('button', { name: 'Включить уведомления' }).click();
  await expect(page.locator('[data-push-status="enabled"]')).toContainText('Уведомления на этом телефоне включены');
  expect(registered).toHaveLength(1);
  expect((registered[0] as { preferences: { news: boolean; orders: boolean } }).preferences).toMatchObject({ news: false, orders: true });
});
