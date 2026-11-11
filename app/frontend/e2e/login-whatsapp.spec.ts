import { test, expect, type Page } from '@playwright/test';

/** WhatsApp sign-in in reverse: the site sends nothing, the person opens WhatsApp with the ready text,
 *  the page waits for our number to receive it and signs in by itself. */
const WA_URL = 'https://wa.me/77004280280?text=%D0%92%D1%85%D0%BE%D0%B4%20%D0%BD%D0%B0%20%D0%A1%D0%BE%D1%80%D1%82%D0%B8%D1%80%D0%BE%D0%B2%D0%BA%D0%B0%2024%3A%204821';
const LOGIN_ID = 'login-id-0123456789abcdefghij';

async function mockApi(page: Page, statuses: Array<{ status: number; json: unknown }>) {
  const calls: { path: string; query: string; body: unknown }[] = [];
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, r => r.abort());
  await page.route('**/api/**', async r => {
    const url = new URL(r.request().url());
    const body: unknown = r.request().postDataJSON() ?? null;
    calls.push({ path: url.pathname, query: url.search, body });
    if (url.pathname.endsWith('/otp-channels')) return r.fulfill({ json: { channels: url.search.includes('purpose=signin') ? ['whatsapp', 'telegram'] : ['telegram'] } });
    if (url.pathname.endsWith('/signin/request-sms')) return r.fulfill({ json: { success: true, channel: 'whatsapp', ttl_seconds: 300, resend_after_seconds: 60, wa_url: WA_URL, login_id: LOGIN_ID } });
    if (url.pathname.endsWith('/signin/whatsapp/status')) return r.fulfill(statuses.length > 1 ? statuses.shift()! : statuses[0]);
    if (url.pathname.endsWith('/account/me')) return r.fulfill({ json: { id: 'u1', name: 'Асия', phone: '+77001234567', role: 'user', status: 'active', bonus_balance: 300 } });
    if (url.pathname.endsWith('/modules')) return r.fulfill({ json: { food: true } });
    return r.fulfill({ status: 404, json: {} });
  });
  return calls;
}

async function startWhatsApp(page: Page) {
  await page.goto('/account');
  await page.getByLabel('Ваше имя', { exact: true }).fill('Асия');
  await page.getByLabel('Номер телефона, код страны +7', { exact: true }).fill('7001234567');
  for (const box of await page.getByRole('checkbox').all()) await box.check();
  await page.getByRole('button', { name: 'Войти через WhatsApp' }).click();
}

test('WhatsApp: the person sends the ready message and the page signs in by itself', async ({ page }) => {
  const calls = await mockApi(page, [
    { status: 200, json: { status: 'pending' } },
    { status: 200, json: { status: 'done', token: 'tok', user_id: 'u1', role: 'user' } },
  ]);
  await startWhatsApp(page);
  const open = page.getByRole('link', { name: 'Открыть WhatsApp и отправить' });
  await expect(open).toHaveAttribute('href', WA_URL);
  await expect(open).toHaveAttribute('target', '_blank');
  await expect(page.getByText('Мы сами вам первыми не пишем')).toBeVisible();
  await expect(page.getByRole('status')).toContainText('Ждём ваше сообщение');
  await expect(page.getByRole('button', { name: /Войти через Telegram/ })).toBeVisible();
  await page.waitForURL('**/cabinet', { timeout: 15000 });

  expect(calls.find(c => c.path.endsWith('/otp-channels'))?.query).toBe('?purpose=signin');
  expect(calls.find(c => c.path.endsWith('/signin/request-sms'))?.body).toMatchObject({ channel: 'whatsapp', legal_subject_name: 'Асия' });
  const polls = calls.filter(c => c.path.endsWith('/signin/whatsapp/status'));
  expect(polls.length).toBeGreaterThanOrEqual(2);
  expect(polls[0].body).toMatchObject({ login_id: LOGIN_ID, agreement_accepted: true, privacy_accepted: true, legal_subject_name: 'Асия' });
});

test('WhatsApp: an expired login asks to start again', async ({ page }) => {
  await mockApi(page, [{ status: 410, json: { detail: 'Время входа вышло. Нажмите «Войти через WhatsApp» ещё раз.' } }]);
  await startWhatsApp(page);
  await expect(page.getByRole('alert')).toContainText('Время входа вышло', { timeout: 10000 });
  await expect(page.getByRole('link', { name: 'Открыть WhatsApp и отправить' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Время вышло — начать заново' })).toBeVisible();
});
