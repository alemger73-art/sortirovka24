import { test, expect } from '@playwright/test';

/** Paid «Поднять»: the button shows the price, asks first, and tells where the Kaspi invoice went. */
test('lifting an ad sends a Kaspi invoice instead of lifting it for free', async ({ page }) => {
  const boosts: string[] = [];
  const ad = { id: 7, title: 'Диван', status: 'approved', active: true, price: '20000', ann_type: 'sell',
    expires_at: new Date(Date.now() + 20 * 86400000).toISOString(), created_at: new Date().toISOString() };
  await page.addInitScript(() => {
    localStorage.setItem('app_lang', 'ru');
    localStorage.setItem('account_token', 'resident-token');
    localStorage.setItem('account_user_profile', JSON.stringify({ id: 5, name: 'Алем', phone: '+77001234567' }));
  });
  await page.route('**/*', r => new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort());
  await page.route('**/api/**', async r => {
    const path = new URL(r.request().url()).pathname;
    if (path.endsWith('/payments/boost-price')) return r.fulfill({ json: { paid: true, price: 500, days: 7 } });
    if (path.endsWith('/announcements/7/boost')) { boosts.push(path); return r.fulfill({ json: { success: true, payment: { status: 'sent', amount: 500, phone: '+77001234567', again: false } } }); }
    if (path.endsWith('/account/me')) return r.fulfill({ json: { id: 5, name: 'Алем', phone: '+77001234567', email: '' } });
    if (path.endsWith('/account/cabinet')) return r.fulfill({ json: { profile: { id: 5, name: 'Алем', phone: '+77001234567' }, bonuses: [], orders: [], complaints: [], announcements: [ad], real_estate: [], master_requests: [], become_master_requests: [], addresses: [], settings: { language: 'ru' } } });
    if (path.endsWith('/modules')) return r.fulfill({ json: { announcements: true, food: true } });
    return r.fulfill({ json: { items: [], total: 0 } });
  });
  let asked = '';
  page.on('dialog', d => { asked = d.message(); void d.accept(); });
  await page.goto('/cabinet?tab=announcements');
  await page.getByRole('button', { name: 'Поднять · 500 ₸' }).click();
  await expect(page.getByText('Счёт на 500 ₸ отправлен в Kaspi')).toBeVisible();
  await expect(page.getByText('На номер +77001234567')).toBeVisible();
  expect(asked).toBe('Поднять в топ на 7 дней за 500 ₸? Счёт придёт в Kaspi. Условия: sortirovka24.kz/legal/boost-offer');
  expect(boosts).toHaveLength(1);
});
