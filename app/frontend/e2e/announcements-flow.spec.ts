import { test, expect, type Page } from '@playwright/test';

const profile = { id: 'alice', name: 'Алия', phone: '+77001234567', role: 'user', has_password: true };
const entries = Array.from({ length: 205 }, (_, i) => ({ id: i + 1, title: i === 204 ? 'Редкий велосипед' : `Объявление ${i + 1}`, description: 'Описание товара', ann_type: 'sell', phone: profile.phone, price: `${i + 1} ₸`, active: true, status: 'approved', created_at: '2026-10-01T12:00:00Z', expires_at: '2099-01-01T00:00:00Z' }));

async function setup(page: Page, options: { fail?: boolean; categories?: boolean; auth?: boolean } = {}) {
  const writes: any[] = [];
  await page.addInitScript(({ profile, auth }) => {
    localStorage.setItem('app_lang', 'ru'); sessionStorage.setItem('s24_welcome_done', '1');
    if (auth) { localStorage.setItem('account_token', 'test-token'); localStorage.setItem('account_user_profile', JSON.stringify(profile)); }
  }, { profile, auth: options.auth });
  await page.route('**/api/**', async (route) => {
    const req = route.request(), url = new URL(req.url()), path = url.pathname;
    let body: any = { items: [], total: 0 };
    if (path.endsWith('/modules')) body = { announcements: true };
    if (path.endsWith('/account/me') || path.endsWith('/auth/me')) body = profile;
    if (path.endsWith('/categories') && options.categories) body = { items: [{ id: 7, slug: 'prodam', name: 'Продам', cat_type: 'announcements', is_active: true, parent_id: null }], total: 1 };
    if (path.endsWith('/announcements')) {
      if (req.method() === 'POST') { writes.push(req.postDataJSON()); body = { ...writes.at(-1), id: 206, status: 'pending' }; }
      else {
        if (options.fail) return route.fulfill({ status: 503, json: { detail: 'Unavailable' } });
        const skip = Number(url.searchParams.get('skip') || 0), limit = Number(url.searchParams.get('limit') || 200);
        body = { items: entries.slice(skip, skip + limit), total: entries.length };
      }
    }
    if (path.endsWith('/announcements/1')) body = { ...entries[0], status: 'pending', user_id: 'alice', active: true, expires_at: null };
    await route.fulfill({ json: body });
  });
  return writes;
}

test('catalog searches beyond first page, resets filters and saves favorites', async ({ page }, info) => {
  await setup(page, { categories: true });
  await page.goto('/announcements');
  await expect(page.getByText('205 объявлений найдено')).toBeVisible();
  await page.getByRole('searchbox').fill('Редкий велосипед');
  await expect(page.getByRole('heading', { name: 'Редкий велосипед' })).toBeVisible();
  await page.getByRole('button', { name: 'Избранное', exact: true }).first().click();
  await expect(page.getByRole('button', { name: 'Избранное', exact: true }).first()).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Сбросить фильтры' }).click();
  await expect(page.getByText('205 объявлений найдено')).toBeVisible();
  await page.getByRole('button', { name: 'Показать ещё' }).click();
  await expect(page.locator('h3')).toHaveCount(48);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: info.outputPath('catalog-desktop.png') });
});

test('fallback category submits the selected type and validates phone', async ({ page }, info) => {
  const writes = await setup(page, { auth: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/announcements/new');
  await page.locator('form select').selectOption('sell');
  await page.locator('form input[type=text]').nth(0).fill('Велосипед');
  await page.locator('form textarea').fill('Рабочий велосипед');
  await page.locator('form input[type=tel]').nth(0).fill('123');
  await page.locator('form button[type=submit]').click();
  await expect(page.getByText(/Проверьте телефон и WhatsApp/)).toBeVisible();
  expect(writes).toHaveLength(0);
  await page.locator('form input[type=tel]').nth(0).fill(profile.phone);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: info.outputPath('form-mobile.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('form button[type=submit]').click();
  await expect(page.getByText('Мои объявления', { exact: true }).last()).toBeVisible();
  expect(writes).toHaveLength(1);
  expect(writes[0].ann_type).toBe('sell');
  expect(writes[0].category_id).toBeUndefined();
});

test('owner sees pending detail with edit action', async ({ page }) => {
  await setup(page, { auth: true });
  await page.goto('/announcements/1');
  await expect(page.getByRole('heading', { name: 'Объявление 1' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Редактировать', exact: true })).toBeVisible();
});

test('owner editing retains a legacy cover and explains resubmission', async ({ page }) => {
  await setup(page, { auth: true });
  let saved: any;
  await page.route('**/api/v1/account/me/announcements/1', async (route) => {
    if (route.request().method() === 'PUT') {
      saved = route.request().postDataJSON();
      return route.fulfill({ json: { success: true, announcement: { ...saved, id: 1 } } });
    }
    return route.fulfill({ json: { ...entries[0], user_id: 'alice', status: 'hidden', image_url: 'https://example.test/cover.jpg', gallery_images: null } });
  });
  await page.goto('/announcements/1/edit');
  await expect(page.getByText(/После сохранения объявление отправится на проверку/)).toBeVisible();
  await expect(page.locator('form select')).toHaveValue('sell');
  await page.locator('form button[type=submit]').click();
  await expect.poll(() => saved?.gallery_images).toBe('https://example.test/cover.jpg');
  expect(saved.ann_type).toBe('sell');
});

test('failed catalog explains the error', async ({ page }) => {
  await setup(page, { fail: true });
  await page.goto('/announcements');
  await expect(page.getByRole('alert').filter({ hasText: 'Не удалось загрузить объявления' })).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole('button', { name: 'Попробовать снова' })).toBeVisible();
});

test('price sort respects price over promotion and public filter respects active', async ({ page }) => {
  await setup(page);
  await page.goto('/announcements');
  const result = await page.evaluate(async () => {
    const modulePath = '/src/lib/announcements.ts';
    const { sortAnnouncements, filterPublicAnnouncements } = await import(modulePath);
    const promoted = { price: '900 ₸', promoted_until: '2099-01-01', promotion_tier: 'vip' };
    return { price: sortAnnouncements([promoted, { price: '100 ₸' }], 'price_asc')[0].price,
      visible: filterPublicAnnouncements([{ status: 'approved', active: false }, { status: 'approved', active: true }]).length };
  });
  expect(result).toEqual({ price: '100 ₸', visible: 1 });
});

test('catalog supports Kazakh on mobile without missing labels or overflow', async ({ page }, info) => {
  await setup(page, { categories: true });
  await page.addInitScript(() => { localStorage.setItem('app_lang', 'kz'); localStorage.setItem('sortirovka-theme', 'dark'); });
  await page.setViewportSize({ width: 390, height: 844 });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.text().includes('[i18n] Missing')) errors.push(message.text()); });
  await page.goto('/announcements');
  await expect(page.getByText('205 хабарландыру табылды')).toBeVisible();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.getByRole('searchbox').fill('велосипед');
  await expect(page.getByRole('heading', { name: 'Редкий велосипед' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({ path: info.outputPath('catalog-mobile-kz.png') });
});

test('moderator can find and approve an announcement', async ({ page }, info) => {
  await setup(page);
  await page.addInitScript(() => { localStorage.setItem('_sp924_token', 'admin-test'); localStorage.setItem('token', 'admin-test'); });
  let approved = false;
  await page.route('**/api/v1/admin-auth/verify-session', (route) => route.fulfill({ json: { valid: true, username: 'test', jwt_token: 'admin-test' } }));
  await page.route('**/api/v1/entities/announcements**', async (route) => {
    const req = route.request();
    if (req.method() === 'PUT') {
      expect(req.postDataJSON().status).toBe('approved');
      approved = true;
      return route.fulfill({ json: { ...entries[0], status: 'approved' } });
    }
    return route.fulfill({ json: { items: approved ? [] : [{ ...entries[0], status: 'pending', expires_at: null }], total: approved ? 0 : 1 } });
  });
  await page.addInitScript(() => { if (location.pathname === '/index.html') history.replaceState(null, '', '/admin?tab=announcements'); });
  await page.goto('/index.html');
  await expect(page.getByRole('heading', { name: 'Объявление 1' })).toBeVisible({ timeout: 60000 });
  await page.getByRole('textbox', { name: /Поиск/ }).fill('Объявление 1');
  await page.screenshot({ path: info.outputPath('moderation.png') });
  await page.getByRole('button', { name: 'Одобрить', exact: true }).click();
  await expect.poll(() => approved).toBe(true);
  await expect(page.getByRole('heading', { name: 'Объявление 1' })).toHaveCount(0);
});
