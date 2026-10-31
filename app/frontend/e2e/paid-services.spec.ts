import { test, expect, type Page } from '@playwright/test';

type Item = { id: number; name: string; amount: number; currency: string; period: string; due_date: string; pay_url: string; note: string; active: boolean; days_left: number | null; price: string };

async function setup(page: Page) {
  const items: Item[] = [
    { id: 1, name: 'Hoster.kz — сервер сайта', amount: 9600, currency: 'KZT', period: 'month', due_date: '2026-11-02', pay_url: 'https://hoster.kz', note: 'Основной сервер', active: true, days_left: 2, price: '9 600 ₸' },
    { id: 2, name: 'Домен sortirovka24.kz', amount: 0, currency: 'KZT', period: 'year', due_date: '', pay_url: '', note: '', active: true, days_left: null, price: '' },
  ];
  const sent: { method: string; path: string; body: any }[] = [];
  const overview = () => ({ items, today: '2026-10-31', chat: null, bot: true, monthly: ['9 600 ₸'], cert: { host: 'www.sortirovka24.kz', days: 70, checked: '2026-10-31' }, log: [] });
  await page.addInitScript(() => { localStorage.setItem('_sp924_token', 'test-admin'); localStorage.setItem('app_lang', 'ru'); });
  await page.route('**/*', (r) => (new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort()));
  await page.routeWebSocket('**/ws/**', (ws) => ws.close());
  await page.route('**/api/**', async (r) => {
    const url = new URL(r.request().url());
    const p = url.pathname;
    const method = r.request().method();
    if (p.includes('verify-session')) return r.fulfill({ json: { valid: true, username: 'owner' } });
    if (p.endsWith('/admin/summary')) return r.fulfill({ json: { total_pending: 0, recent: [] } });
    if (p.includes('/paid-services')) {
      const body = r.request().postDataJSON?.() ?? null;
      if (method !== 'GET') sent.push({ method, path: p, body });
      if (method === 'POST' && p.endsWith('/paid-services')) items.push({ ...body, id: 3, days_left: 7, price: '$20' });
      if (method === 'POST' && p.endsWith('/1/paid')) { items[0] = { ...items[0], due_date: '2026-12-02', days_left: 32 }; return r.fulfill({ json: { ...overview(), answer: 'Hoster.kz — сервер сайта: оплачено. Следующая оплата 2 декабря' } }); }
      if (p.endsWith('/test')) return r.fulfill({ json: { ok: true } });
      return r.fulfill({ json: overview() });
    }
    return r.fulfill({ json: method === 'GET' ? { items: [], total: 0 } : { ok: true } });
  });
  return sent;
}

test('paid services: due badges, add a service, «Оплачено», Telegram check', async ({ page }, info) => {
  const sent = await setup(page);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/admin?tab=payments');
  const root = page.getByTestId('admin-paid-services');
  await expect(root).toBeVisible();
  await expect(root).toContainText('личный чат с ботом');
  await expect(root).toContainText('Оплаты сервисов');
  await expect(root).toContainText('в месяц примерно 9 600 ₸');
  await expect(page.getByTestId('paid-row').first()).toContainText('Через 2 дн.');
  await expect(page.getByTestId('paid-row').nth(1)).toContainText('Дата не указана');
  await expect(root).toContainText('У 1 сервиса не указана дата');

  await page.getByRole('button', { name: 'Добавить сервис' }).click();
  const form = page.getByTestId('paid-form');
  await form.getByLabel('Название').fill('ElevenLabs');
  await form.getByLabel('Сумма').fill('20');
  await form.getByLabel('Валюта').selectOption('USD');
  await form.getByLabel('Следующая оплата').fill('2026-11-07');
  await form.getByLabel('Ссылка на оплату').fill('https://elevenlabs.io/app/subscription');
  await form.getByRole('button', { name: 'Сохранить' }).click();
  await expect(form).toBeHidden();
  const created = sent.find((s) => s.method === 'POST' && s.path.endsWith('/paid-services'));
  expect(created?.body).toMatchObject({ name: 'ElevenLabs', amount: 20, currency: 'USD', period: 'month', due_date: '2026-11-07', active: true });
  await expect(page.getByTestId('paid-row')).toHaveCount(3);

  await page.getByTestId('paid-row').first().getByRole('button', { name: '✅ Оплачено' }).click();
  await expect(page.getByText('Следующая оплата 2 декабря')).toBeVisible();
  await expect(page.getByTestId('paid-row').first()).toContainText('Через 32 дн.');

  await page.getByRole('button', { name: /прислать список/ }).click();
  await expect(page.getByText('Список отправлен в Телеграм')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: info.outputPath('paid-services.png'), fullPage: true });
  expect(errors).toEqual([]);
});
