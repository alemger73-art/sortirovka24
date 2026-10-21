import { test, expect, type Page } from '@playwright/test';

const profile = { id: 'alice', name: 'Алия', phone: '+77001234567', role: 'user', has_password: true };
const entries = Array.from({ length: 205 }, (_, i) => ({ id: i + 1, ann_type: i % 10 === 5 ? 'job' : i % 10 === 6 ? 'seek' : 'sell', title: i === 204 ? 'Редкий велосипед' : `Объявление ${i + 1}`, description: 'Описание товара', phone: profile.phone, price: `${i + 1} ₸`, active: true, status: 'approved', created_at: '2026-10-01T12:00:00Z', expires_at: '2099-01-01T00:00:00Z' }));

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
    if (path.endsWith('/announcements/events')) { writes.push({ events: req.postDataJSON() }); return route.fulfill({ status: 202, json: { ok: true } }); }
    if (/\/announcements\/\d+\/save$/.test(path)) { writes.push({ save: path, body: req.postDataJSON() }); return route.fulfill({ status: 202, json: { ok: true } }); }
    if (path.endsWith('/announcements/3/report')) { writes.push({ report: req.postDataJSON() }); return route.fulfill({ status: 202, json: { accepted: true } }); }
    if (path.endsWith('/announcements/3')) body = { ...entries[2], user_id: 'bob', phone: '87011112233', whatsapp: '+77011112233', gallery_images: '' };
    if (path.endsWith('/announcements/1')) body = { ...entries[0], status: 'pending', user_id: 'alice', active: true, expires_at: null };
    await route.fulfill({ json: body });
  });
  return writes;
}


const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

test('catalog: search beyond first page, «Работа» chip, favorites, show more', async ({ page }, info) => {
  await setup(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/announcements');
  await expect(page.getByText('205 объявл.')).toBeVisible();
  await page.getByRole('button', { name: /Работа/ }).click();
  await expect(page).toHaveURL(/type=job/);
  await expect(page.getByText('40 объявл.')).toBeVisible();
  await expect(page.getByTestId('ad-post')).toHaveAttribute('href', '/announcements/new?type=job');
  await page.getByRole('button', { name: /Все/ }).click();
  await page.getByRole('searchbox').fill('Редкий велосипед');
  await expect(page.getByRole('heading', { name: 'Редкий велосипед' })).toBeVisible();
  await page.getByRole('button', { name: 'В избранное' }).first().click();
  await page.getByRole('searchbox').fill('');
  await page.getByRole('button', { name: /Избранное/ }).click();
  await expect(page.getByText('1 объявл.')).toBeVisible();
  await page.getByRole('button', { name: /Избранное/ }).click();
  await page.getByRole('button', { name: 'Показать ещё' }).click();
  await expect(page.locator('h3')).toHaveCount(48);
  expect(await noOverflow(page)).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: info.outputPath('catalog-mobile.png') });
});

test('3-step form: vacancy with schedule, validation, prefilled contacts, preview, success', async ({ page }, info) => {
  const writes = await setup(page, { auth: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/announcements/new');
  await expect(page.getByRole('heading', { name: 'Что хотите разместить?' })).toBeVisible();
  expect(await noOverflow(page)).toBe(true);
  await page.screenshot({ path: info.outputPath('step1.png'), fullPage: true });
  await page.locator('[data-kind=job]').click();
  await page.getByTestId('ad-next').click();
  await expect(page.getByText('Напишите, что это, хотя бы 3 буквы').first()).toBeVisible();
  await page.getByRole('button', { name: 'Сменный' }).click();
  await page.getByLabel('Заголовок').fill('Требуется продавец');
  await page.getByLabel('Зарплата, ₸').fill('250000');
  await page.getByLabel('Описание').fill('Магазин на Ермекова, опыт не нужен');
  await page.getByRole('button', { name: 'Сортировка', exact: true }).click();
  expect(await noOverflow(page)).toBe(true);
  await page.screenshot({ path: info.outputPath('step2.png'), fullPage: true });
  // Draft survives a reload.
  await page.reload();
  await expect(page.getByLabel('Заголовок')).toHaveValue('Требуется продавец');
  await page.getByTestId('ad-next').click();
  await expect(page.getByText('+7 700 123 45 67')).toBeVisible();
  await expect(page.getByText('WhatsApp на этом же номере')).toBeVisible();
  await expect(page.getByText('250 000 ₸')).toBeVisible();
  await page.screenshot({ path: info.outputPath('step3.png'), fullPage: true });
  await page.getByTestId('ad-submit').click();
  await expect(page.getByRole('heading', { name: 'Объявление отправлено!' })).toBeVisible();
  expect(writes).toHaveLength(1);
  expect(writes[0]).toMatchObject({ ann_type: 'job', title: 'Требуется продавец', price: '250000', address: 'Сортировка', phone: '+77001234567', whatsapp: '+77001234567', author_name: 'Алия' });
  expect(writes[0].description).toBe('График: Сменный\nМагазин на Ермекова, опыт не нужен');
  expect(await page.evaluate(() => localStorage.getItem('s24_ad_draft_v1'))).toBeNull();
  await page.screenshot({ path: info.outputPath('success.png'), fullPage: true });
});

test('form refuses a wrong phone and «Отдам даром» needs no price', async ({ page }) => {
  const writes = await setup(page, { auth: true });
  await page.addInitScript(() => { if (!sessionStorage.getItem('x')) { sessionStorage.setItem('x', '1'); localStorage.setItem('account_user_profile', JSON.stringify({ id: 'alice', name: '', phone: '', role: 'user' })); } });
  await page.route('**/api/v1/account/me', (r) => r.fulfill({ json: { id: 'alice', name: '', phone: '' } }));
  await page.goto('/announcements/new?type=free');
  await expect(page.getByLabel(/Цена/)).toHaveCount(0);
  await page.getByLabel('Заголовок').fill('Детские вещи');
  await page.getByLabel('Описание').fill('Отдам пакет вещей на 2–3 года');
  await page.getByTestId('ad-next').click();
  await page.getByLabel('Телефон').fill('123');
  await page.getByTestId('ad-submit').click();
  await expect(page.getByText(/Укажите номер телефона/).first()).toBeVisible();
  expect(writes).toHaveLength(0);
  await page.getByLabel('Телефон').fill('8 701 111 22 33');
  await page.getByTestId('ad-submit').click();
  await expect(page.getByRole('heading', { name: 'Объявление отправлено!' })).toBeVisible();
  expect(writes[0]).toMatchObject({ ann_type: 'free', price: 'Бесплатно', phone: '+77011112233' });
});

test('detail: call and WhatsApp bar, share, report goes to the owner', async ({ page }, info) => {
  const writes = await setup(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/announcements/3');
  await expect(page.getByRole('heading', { name: 'Объявление 3' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Позвонить' })).toHaveAttribute('href', 'tel:+77011112233');
  await expect(page.getByRole('link', { name: 'WhatsApp' })).toHaveAttribute('href', /wa\.me\/77011112233\?text=/);
  await page.screenshot({ path: info.outputPath('detail.png'), fullPage: true });
  await page.getByRole('button', { name: 'Пожаловаться' }).click();
  await page.getByRole('button', { name: 'Мошенник, просит предоплату' }).click();
  await page.getByRole('button', { name: 'Отправить жалобу' }).click();
  await expect(page.getByText('Спасибо! Мы проверим объявление.')).toBeVisible();
  expect(writes.filter((w: any) => w.report)).toEqual([{ report: { reason: 'Мошенник, просит предоплату' } }]);
  expect(await noOverflow(page)).toBe(true);
});

test('owner sees pending notice and edit action; /jobs opens work ads', async ({ page }) => {
  await setup(page, { auth: true });
  await page.goto('/announcements/1');
  await expect(page.getByRole('heading', { name: 'Объявление 1' })).toBeVisible();
  await expect(page.getByText(/на проверке/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Изменить', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Позвонить' })).toHaveCount(0);
  await page.goto('/jobs');
  await expect(page).toHaveURL(/\/announcements\?type=job/);
});

test('failed catalog explains the error', async ({ page }) => {
  await setup(page, { fail: true });
  await page.goto('/announcements');
  await expect(page.getByRole('alert').filter({ hasText: 'Не удалось загрузить объявления' })).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole('button', { name: 'Повторить' })).toBeVisible();
});

test('Kazakh + dark theme on mobile: no missing labels, no overflow', async ({ page }, info) => {
  await setup(page, { auth: true });
  await page.addInitScript(() => { localStorage.setItem('app_lang', 'kz'); localStorage.setItem('sortirovka-theme', 'dark'); });
  await page.setViewportSize({ width: 390, height: 844 });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.text().includes('[i18n] Missing')) errors.push(message.text()); });
  await page.goto('/announcements');
  await expect(page.getByRole('heading', { name: 'Хабарландырулар' })).toBeVisible();
  await page.getByRole('searchbox').fill('велосипед');
  await expect(page.getByRole('heading', { name: 'Редкий велосипед' })).toBeVisible();
  expect(await noOverflow(page)).toBe(true);
  await page.screenshot({ path: info.outputPath('catalog-mobile-kz.png') });
  await page.goto('/announcements/new');
  await expect(page.getByRole('heading', { name: 'Не орналастырғыңыз келеді?' })).toBeVisible();
  expect(await noOverflow(page)).toBe(true);
  await page.screenshot({ path: info.outputPath('step1-kz.png'), fullPage: true });
  expect(errors).toEqual([]);
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
  // Editing opens the same friendly form as a new ad, already filled, and says it will be checked again.
  await expect(page.getByRole('heading', { name: 'Изменить объявление' })).toBeVisible();
  await expect(page.getByText(/снова пройдёт быструю проверку/)).toBeVisible();
  await expect(page.locator('#ad-title')).toHaveValue(entries[0].title);
  await page.getByTestId('ad-next').click();
  await page.getByTestId('ad-submit').click();
  await expect.poll(() => saved?.gallery_images).toBe('https://example.test/cover.jpg');
  expect(saved.ann_type).toBe('sell');
  await expect(page).toHaveURL(/\/cabinet\?tab=announcements/);
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

test('real statistics: list impressions, one view, call, WhatsApp and saves are reported; the owner is not counted', async ({ page }) => {
  const writes = await setup(page);
  const events = async () => writes.filter((w: any) => w.events).flatMap((w: any) => w.events.events.map((e: any) => `${e.id}:${e.kind}`));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/announcements');
  await expect(page.getByText('205 объявл.')).toBeVisible();
  await page.getByRole('button', { name: 'В избранное' }).first().click();
  await expect.poll(() => writes.find((w: any) => w.save)?.body?.saved).toBe(true);
  // Cards that stayed on screen are reported as «показы» in a small batch.
  await expect.poll(async () => (await events()).some((e: string) => e.endsWith(':impression')), { timeout: 8000 }).toBe(true);
  await page.goto('/announcements/3');
  await expect(page.getByRole('link', { name: 'Позвонить' })).toBeVisible();
  await page.evaluate(() => { document.querySelectorAll('a[href^="tel:"], a[href*="wa.me"]').forEach((a) => a.addEventListener('click', (e) => e.preventDefault())); });
  await page.getByRole('link', { name: 'Позвонить' }).click();
  await page.getByRole('link', { name: 'WhatsApp' }).click();
  await expect.poll(events).toEqual(expect.arrayContaining(['3:view', '3:phone', '3:whatsapp']));
  const visitors = new Set(writes.filter((w: any) => w.events).map((w: any) => w.events.visitor));
  expect(visitors.size).toBe(1);
  expect((await events()).filter((e: string) => e === '3:view')).toHaveLength(1);
});

test('owner opening own ad does not send a view', async ({ page }) => {
  const writes = await setup(page, { auth: true });
  await page.goto('/announcements/1');
  await expect(page.getByText(/проверке/).first()).toBeVisible();
  await page.waitForTimeout(2500);
  expect(writes.filter((w: any) => w.events)).toHaveLength(0);
});
