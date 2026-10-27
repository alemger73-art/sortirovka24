import { test, expect, type Page } from '@playwright/test';

const profile = { id: 'alice', name: 'Алия', phone: '+77001234567', role: 'user' };
const day = new Date(Date.now() + 40 * 86400000).toISOString().slice(0, 10);

async function setup(page: Page, opts: { auth?: boolean } = {}) {
  const writes: any[] = [];
  let saved: any = null;
  await page.addInitScript(({ profile, auth }) => {
    localStorage.setItem('app_lang', 'ru'); sessionStorage.setItem('s24_welcome_done', '1');
    if (auth) { localStorage.setItem('account_token', 'test-token'); localStorage.setItem('account_user_profile', JSON.stringify(profile)); }
  }, { profile, auth: opts.auth });
  await page.route('**/api/**', async (route) => {
    const req = route.request(), path = new URL(req.url()).pathname, m = req.method();
    if (path.endsWith('/account/me') || path.endsWith('/auth/me')) return route.fulfill({ json: profile });
    if (path.endsWith('/toy/config')) return route.fulfill({ json: { enabled: true, price: 4990 } });
    if (path.endsWith('/toy/invites') && m === 'POST') { writes.push({ create: req.postDataJSON() }); saved = { id: 7, slug: 'aibek-aruzhan-1a2b', status: 'draft', data: req.postDataJSON().data, link: 'https://www.sortirovka24.kz/toy/aibek-aruzhan-1a2b' }; return route.fulfill({ status: 201, json: saved }); }
    if (path.endsWith('/toy/invites/7/publish')) { writes.push({ publish: 7 }); saved = { ...saved, status: 'pending', price: 4990 }; return route.fulfill({ json: saved }); }
    if (path.endsWith('/toy/invites/7') && m === 'PUT') { saved = { ...saved, data: req.postDataJSON().data }; return route.fulfill({ json: saved }); }
    if (path.endsWith('/toy/invites/mine')) return route.fulfill({ json: { items: [{ ...(saved || {}), id: 7, slug: 'aibek-aruzhan-1a2b', status: 'published', views: 12, link: 'https://www.sortirovka24.kz/toy/aibek-aruzhan-1a2b', guests: { coming: 3, people: 7, declined: 1 }, data: saved?.data || { kind: 'wedding', theme: 'night', langs: 'both', name1: 'Айбек', name2: 'Аружан', date: day, time: '18:00', place: '«Мерей»', address: '', map_url: '', hosts: '', text_kz: '', text_ru: '', program: [] } }] } });
    if (path.endsWith('/toy/invites/7/guests')) return route.fulfill({ json: { items: [{ name: 'Ерлан', coming: true, guests: 3, wish: 'Бақытты болыңдар!' }, { name: 'Сауле', coming: false, guests: 0, wish: '' }], coming: 1, people: 3, declined: 1 } });
    if (path.endsWith('/toy/public/aibek-aruzhan-1a2b/rsvp')) { writes.push({ rsvp: req.postDataJSON() }); return route.fulfill({ json: { ok: true } }); }
    if (path.endsWith('/toy/public/aibek-aruzhan-1a2b')) return route.fulfill({ json: { slug: 'aibek-aruzhan-1a2b', status: 'published', preview: false, owner: false, data: { kind: 'wedding', theme: 'pomegranate', langs: 'both', name1: 'Айбек', name2: 'Аружан', date: day, time: '18:00', place: '«Мерей» мейрамханасы', address: 'Караганда, Сортировка', map_url: '', hosts: 'Нұрлан – Гүлнар', text_kz: 'Құрметті ағайын-туыс!', text_ru: 'Дорогие родные!', program: [{ time: '18:00', kz: 'Той басталады', ru: 'Начало' }] } } });
    if (path.includes('/toy/public/')) return route.fulfill({ status: 404, json: { detail: 'not found' } });
    return route.fulfill({ json: { items: [], total: 0 } });
  });
  return writes;
}
const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);

test('landing explains the service and price', async ({ page }, info) => {
  await setup(page);
  await page.goto('/toy');
  await expect(page.getByRole('heading', { name: /Приглашение на той/ })).toBeVisible();
  await expect(page.getByText('4 990 ₸')).toBeVisible();
  await expect(page.getByTestId('toy-create')).toHaveAttribute('href', '/toy/new');
  expect(await noOverflow(page)).toBe(true);
  await page.screenshot({ path: info.outputPath('landing.png'), fullPage: true });
});

test('builder: kind → details with ready Kazakh text → design → save → publish', async ({ page }, info) => {
  const writes = await setup(page, { auth: true });
  await page.goto('/toy/new');
  await page.locator('[data-kind=wedding]').click();
  await expect(page.locator('#toy-text-kz')).toHaveValue(/Құрметті ағайын-туыс/);
  await page.getByTestId('toy-next').click();
  await expect(page.getByText('Напишите: жених')).toBeVisible();
  await page.locator('#toy-name1').fill('Айбек');
  await page.locator('#toy-name2').fill('Аружан');
  await page.locator('#toy-place').fill('Ресторан «Мерей»');
  await page.getByTestId('toy-next').click();
  await page.locator('[data-theme-pick=pomegranate]').click();
  await expect(page.locator('.toy-card[data-theme-name=pomegranate]').first()).toBeVisible();
  // Kazakh «and» after a voiceless consonant: «Айбек пен Аружан».
  await expect(page.locator('.toy-names .amp').first()).toHaveText('пен');
  expect(await noOverflow(page)).toBe(true);
  await page.screenshot({ path: info.outputPath('builder-design.png'), fullPage: true });
  await page.getByTestId('toy-save').click();
  await expect(page.getByRole('heading', { name: 'Сохранено' })).toBeVisible();
  expect(writes[0].create.data).toMatchObject({ kind: 'wedding', theme: 'pomegranate', name1: 'Айбек', name2: 'Аружан' });
  await page.getByTestId('toy-pay').click();
  await expect(page.getByRole('heading', { name: 'Ждём оплату' })).toBeVisible();
  expect(writes.some((w) => w.publish === 7)).toBe(true);
});

test('guest opens the invitation, switches language and answers', async ({ page }, info) => {
  const writes = await setup(page);
  await page.goto('/toy/aibek-aruzhan-1a2b');
  await expect(page.locator('.toy-names')).toContainText('Айбек');
  await expect(page.locator('.toy-names .amp')).toHaveText('пен');
  await expect(page.getByText('Құрметті ағайын-туыс!')).toBeVisible();
  await page.getByRole('button', { name: 'РУС' }).click();
  await expect(page.getByText('Дорогие родные!')).toBeVisible();
  await expect(page.locator('.toy-names .amp')).toHaveText('и');
  await expect(page.getByRole('link', { name: 'Открыть на карте' })).toHaveAttribute('href', /2gis\.kz/);
  expect(await noOverflow(page)).toBe(true);
  await page.screenshot({ path: info.outputPath('public.png'), fullPage: true });
  await page.getByTestId('toy-rsvp-send').click();
  await expect(page.getByText('Напишите ваше имя')).toBeVisible();
  await page.locator('#toy-guest-name').fill('Ерлан');
  await page.getByRole('button', { name: '+' }).click();
  await page.getByTestId('toy-rsvp-send').click();
  await expect(page.getByText('Ерлан, ждём вас! Гостей: 2.')).toBeVisible();
  expect(writes.find((w) => w.rsvp).rsvp).toMatchObject({ name: 'Ерлан', coming: true, guests: 2 });
});

test('unknown invitation shows a friendly message; host sees guests', async ({ page }) => {
  await setup(page, { auth: true });
  await page.goto('/toy/nope-0000');
  await expect(page.getByText('Шақыру табылмады')).toBeVisible();
  await page.goto('/toy/my');
  await expect(page.getByTestId('toy-mine-item')).toContainText('придут: 7');
  await page.getByRole('button', { name: /Гости/ }).click();
  await expect(page.getByText('«Бақытты болыңдар!»')).toBeVisible();
  await expect(page.getByRole('link', { name: /Разослать/ })).toHaveAttribute('href', /wa\.me\/\?text=/);
});
