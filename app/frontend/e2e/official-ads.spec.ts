import { test, expect, type Page } from '@playwright/test';

const profile = { id: 'alice', name: 'Алия', phone: '+77001234567', role: 'user', has_password: true };
const ad = { id: 1, ann_type: 'rent', title: 'Сдам квартиру', description: 'Двушка у вокзала', phone: profile.phone, price: '150 000 тг', user_id: 'alice', active: true, status: 'approved', views_count: 12, gallery_images: 'https://res.cloudinary.com/x/a.jpg', created_at: '2026-10-01T12:00:00Z', expires_at: '2099-01-01T00:00:00Z' };

async function setup(page: Page, auth = true, mine: any[] = []) {
  const writes: any[] = [];
  await page.addInitScript(({ profile, auth }) => {
    localStorage.setItem('app_lang', 'ru'); sessionStorage.setItem('s24_welcome_done', '1');
    if (auth) { localStorage.setItem('account_token', 'test-token'); localStorage.setItem('account_user_profile', JSON.stringify(profile)); }
  }, { profile, auth });
  await page.route('**/api/**', async (route) => {
    const req = route.request(), path = new URL(req.url()).pathname;
    let body: any = { items: [], total: 0 };
    if (path.endsWith('/modules')) body = { announcements: true };
    if (path.endsWith('/account/me') || path.endsWith('/auth/me')) body = profile;
    if (path.endsWith('/official-ads/config')) body = { enabled: true, channel: 'Sortirovka Official', subscribers: '30 000', intro: 'В Sortirovka Official — 30 000 живых подписчиков, жителей Сортировки.', categories: [
      { code: 'business', title: 'Бизнес', price: 5000, description: 'Реклама компаний' },
      { code: 'services', title: 'Недвижимость и услуги', price: 3000, description: 'Квартиры, услуги' },
      { code: 'private', title: 'Вакансии и частные объявления', price: 1500, description: 'Работа, личные вещи' }] };
    if (path.endsWith('/official-ads/requests/mine')) body = { items: mine };
    if (path.endsWith('/official-ads/requests') && req.method() === 'POST') {
      writes.push(req.postDataJSON());
      return route.fulfill({ status: 201, json: { id: 9, status: 'new', created_at: '2026-10-26T12:00:00', photos: [], ...writes.at(-1) } });
    }
    if (path.endsWith('/me/announcements/1') || path.endsWith('/entities/announcements/1')) body = ad;
    if (path.endsWith('/entities/announcements')) body = { items: [ad], total: 1 };
    await route.fulfill({ json: body });
  });
  return writes;
}

const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

test('official: intro, three prices, prefill from own ad, submit → WhatsApp promise', async ({ page }, info) => {
  const writes = await setup(page);
  await page.goto('/announcements/official?ad=1');
  await expect(page.getByTestId('official-hero')).toContainText('30 000');
  await expect(page.getByTestId('official-cat-business')).toContainText('5 000 тг');
  await expect(page.getByTestId('official-cat-services')).toContainText('3 000 тг');
  await expect(page.getByTestId('official-cat-private')).toContainText('1 500 тг');
  // A rent ad suggests «Недвижимость и услуги» and fills the text.
  await expect(page.getByTestId('official-cat-services')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('official-body')).toHaveValue(/Сдам квартиру/);
  expect(await noOverflow(page)).toBe(true);
  await page.screenshot({ path: info.outputPath('official-top.png'), fullPage: true });
  await page.getByTestId('official-cat-business').click();
  await page.getByTestId('official-submit').click();
  await expect(page.getByRole('heading', { name: 'Заявка отправлена' })).toBeVisible();
  await expect(page.getByText('+7 700 123 45 67')).toBeVisible();
  expect(writes[0]).toMatchObject({ wish: 'business', ann_id: 1, phone: '+77001234567' });
});

test('official: guests see prices and a login button; priced request shows Kaspi button', async ({ page }) => {
  await setup(page, false);
  await page.goto('/announcements/official');
  await expect(page.getByTestId('official-cat-business')).toBeVisible();
  await expect(page.getByTestId('official-login')).toHaveAttribute('href', /redirect=%2Fannouncements%2Fofficial/);
  await page.close();
});

test('official: my requests with payment link', async ({ page }) => {
  await setup(page, true, [{ id: 5, status: 'priced', category: 'business', price: 5000, pay_link: 'https://pay.kaspi.kz/pay/t', body: 'Магазин', photos: [], created_at: '2026-10-26T10:00:00' }]);
  await page.goto('/announcements/official');
  await expect(page.getByTestId('official-mine')).toContainText('Ожидает оплаты');
  await expect(page.getByRole('link', { name: /Оплатить в Kaspi/ })).toHaveAttribute('href', 'https://pay.kaspi.kz/pay/t');
});

test('ads list and own ad show the Official offer and real views', async ({ page }, info) => {
  await setup(page);
  await page.goto('/announcements');
  await expect(page.getByTestId('official-promo')).toHaveAttribute('href', '/announcements/official');
  await expect(page.getByTestId('ads-tip')).toBeVisible();
  await page.getByRole('button', { name: 'Понятно' }).click();
  await expect(page.getByTestId('ads-tip')).toHaveCount(0);
  await expect(page.locator('a[href="/announcements/1"]')).toContainText('12');
  expect(await noOverflow(page)).toBe(true);
  await page.screenshot({ path: info.outputPath('list.png') });
  await page.goto('/announcements/1');
  await expect(page.getByTestId('official-promo')).toHaveAttribute('href', '/announcements/official?ad=1');
  await expect(page.getByText('Посмотрели:')).toBeVisible();
  await page.screenshot({ path: info.outputPath('detail-owner.png'), fullPage: true });
});
