import { test, expect, type Page } from '@playwright/test';

const profile = { id: 'alice', name: 'Алия Сапарова', phone: '+77001234567', role: 'user' };
const ago = (min: number) => new Date(Date.now() - min * 60000).toISOString();
type Opts = { auth?: boolean; member?: 'none' | 'pending' | 'first' | 'confirmed'; lang?: string; dark?: boolean };

async function setup(page: Page, opts: Opts = {}) {
  const writes: any[] = [];
  const memberBase = { id: 5, kind: 'flat', street: 'Жекибаева', house: '135', entrance: 3, flat: '41', display_name: 'Алия', anonymous: false, role: 'member', custom_street: 0, title: 'ул. Жекибаева, 135', public_name: 'Алия' };
  let member: any = opts.member === 'none' || !opts.member ? null : { ...memberBase, status: opts.member === 'confirmed' ? 'confirmed' : 'pending' };
  let confirm = { confirmed_in_house: opts.member === 'first' ? 0 : 4, needed: opts.member === 'first' ? 0 : 2, got: 1, proof_sent: false, proof_waiting: false };
  let posts: any[] = [
    { id: 11, kind: 'alarm', body: 'В 3 подъезде с утра нет света, на площадке темно. Кто-нибудь звонил?', entrance: 3, pinned: false, me_too: 6, i_me_too: false, comments: 2, created_at: ago(14), last_activity: ago(3), author: { name: 'Ерлан', entrance: 3, elder: false }, mine: false, can_moderate: false },
    { id: 10, kind: 'notice', body: 'Собрание жильцов в субботу в 11:00 у первого подъезда. Обсуждаем ремонт крыши.', entrance: null, pinned: true, me_too: 12, i_me_too: true, comments: 4, created_at: ago(60 * 26), last_activity: ago(60 * 5), author: { name: 'Гульнар', entrance: 1, elder: true }, mine: false, can_moderate: false },
    { id: 9, kind: 'lost', body: 'Нашла ключи у подъезда, синий брелок. Отдам в 12 квартире.', entrance: null, pinned: false, me_too: 0, i_me_too: false, comments: 0, created_at: ago(60 * 50), last_activity: ago(60 * 50), author: { name: 'Сосед из 2 подъезда', entrance: 2, elder: false }, mine: false, can_moderate: false },
  ];
  const thread = [
    { id: 1, body: 'Позвонил в Қарағанды Жарық, обещали до обеда.', created_at: ago(8), mine: false, author: { name: 'Марат', entrance: 3, elder: false }, is_author: false },
    { id: 2, body: 'Спасибо!', created_at: ago(3), mine: false, author: { name: 'Ерлан', entrance: 3, elder: false }, is_author: true },
  ];
  await page.addInitScript(({ profile, auth, lang, dark }) => {
    localStorage.setItem('app_lang', lang || 'ru'); sessionStorage.setItem('s24_welcome_done', '1');
    if (dark) localStorage.setItem('sortirovka-theme', 'dark');
    if (auth) { localStorage.setItem('account_token', 'test-token'); localStorage.setItem('account_user_profile', JSON.stringify(profile)); }
  }, { profile, auth: opts.auth, lang: opts.lang, dark: opts.dark });
  await page.route('**/*', (r) => (new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort()));
  await page.route('**/api/**', async (route) => {
    const req = route.request(), url = new URL(req.url()), path = url.pathname, m = req.method();
    const json = (j: unknown, status = 200) => route.fulfill({ status, json: j });
    if (path.endsWith('/account/me') || path.endsWith('/auth/me')) return json(profile);
    if (path.endsWith('/neighbors/streets')) return json({ streets: ['Жекибаева', 'Локомотивная', 'Маншук Маметовой', 'Победы', 'Дружбы', 'Серова'], stats: { neighbours: 214, houses: 31 } });
    if (path.endsWith('/neighbors/me') && m === 'GET') return json(member ? { member, confirm } : { member: null, suggested_name: 'Алия' });
    if (path.endsWith('/neighbors/me') && m === 'PUT') {
      const a = req.postDataJSON(); writes.push({ save: a });
      member = { ...memberBase, street: a.street, house: a.house, entrance: Number(a.entrance), flat: a.flat, display_name: a.display_name, anonymous: a.anonymous, status: 'pending', title: `ул. ${a.street}, ${a.house}`, public_name: a.anonymous ? `Сосед из ${a.entrance} подъезда` : a.display_name };
      confirm = { confirmed_in_house: 0, needed: 0, got: 0, proof_sent: false, proof_waiting: false };
      return json({ member, confirm });
    }
    if (path.endsWith('/neighbors/me') && m === 'DELETE') { writes.push({ leave: true }); member = null; return json({ ok: true }); }
    if (path.endsWith('/neighbors/me/proof')) { writes.push({ proof: req.postDataJSON().image.slice(0, 23) }); confirm = { ...confirm, proof_sent: true, proof_waiting: true }; return json({ member, confirm }); }
    if (path.endsWith('/neighbors/house')) {
      if (member?.status !== 'confirmed') return json({ people: [], waiting: [], entrances: {}, total: 4, locked: true });
      return json({ total: 4, locked: false, entrances: { 1: 1, 3: 3 }, waiting: [{ id: 21, name: 'Сосед из 3 подъезда', entrance: 3, elder: false, me: false, since: '', i_confirmed: false }],
        people: [{ id: 5, name: 'Алия', entrance: 3, elder: false, me: true, since: '2026-10-20' }, { id: 6, name: 'Ерлан', entrance: 3, elder: false, me: false, since: '' }, { id: 7, name: 'Марат', entrance: 3, elder: false, me: false, since: '' }, { id: 8, name: 'Гульнар', entrance: 1, elder: true, me: false, since: '' }] });
    }
    if (path.endsWith('/neighbors/confirm/21')) { writes.push({ confirm: 21 }); return json({ confirmed: false, got: 1, needed: 2 }); }
    if (path.endsWith('/neighbors/feed')) {
      const kind = url.searchParams.get('kind');
      return json({ items: posts.filter((p) => !kind || p.kind === kind), next: '' });
    }
    if (path.endsWith('/neighbors/posts') && m === 'POST') {
      const b = req.postDataJSON(); writes.push({ post: b });
      const p = { id: 50, kind: b.kind, body: b.body, entrance: b.only_entrance ? 3 : null, pinned: false, me_too: 0, i_me_too: false, comments: 0, created_at: ago(0), last_activity: ago(0), author: { name: 'Алия', entrance: 3, elder: false }, mine: true, can_moderate: false };
      posts = [p, ...posts]; return json(p, 201);
    }
    const metoo = path.match(/\/neighbors\/posts\/(\d+)\/metoo$/);
    if (metoo) { writes.push({ metoo: Number(metoo[1]) }); const p = posts.find((x) => x.id === Number(metoo[1])); p.i_me_too = !p.i_me_too; p.me_too += p.i_me_too ? 1 : -1; return json({ me_too: p.me_too, i_me_too: p.i_me_too }); }
    const cm = path.match(/\/neighbors\/posts\/(\d+)\/comments$/);
    if (cm) { const b = req.postDataJSON(); writes.push({ comment: b.body }); thread.push({ id: 3, body: b.body, created_at: ago(0), mine: true, author: { name: 'Алия', entrance: 3, elder: false }, is_author: false }); return json({ ...posts[0], ...posts.find((x) => x.id === 11), comments: thread.length, hidden: false, thread }); }
    const one = path.match(/\/neighbors\/posts\/(\d+)$/);
    if (one && m === 'GET') { const p = posts.find((x) => x.id === Number(one[1])); return p ? json({ ...p, hidden: false, thread }) : json({ detail: 'Запись не найдена' }, 404); }
    if (path.endsWith('/neighbors/report')) { writes.push({ report: req.postDataJSON() }); return json({ hidden: false }); }
    return json({ items: [], total: 0 });
  });
  return writes;
}
const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);

test('guest sees what «Мой дом» is and a login button that comes back to /dom', async ({ page }, info) => {
  await setup(page);
  await page.goto('/dom');
  await expect(page.getByRole('heading', { name: 'Мой дом' })).toBeVisible();
  await expect(page.getByTestId('dom-login')).toHaveAttribute('href', '/account?redirect=%2Fdom');
  await expect(page.getByText('Уже 214 соседей из 31 домов')).toBeVisible();
  expect(await noOverflow(page)).toBe(true);
  await page.screenshot({ path: info.outputPath('landing.png'), fullPage: true });
});

test('new resident: address form with street suggestions → first in house → receipt photo', async ({ page }, info) => {
  const writes = await setup(page, { auth: true, member: 'none' });
  await page.goto('/dom');
  await expect(page.getByRole('heading', { name: 'Где вы живёте?' })).toBeVisible();
  await expect(page.locator('#dom-name')).toHaveValue('Алия');
  await page.getByTestId('dom-save').click();
  await expect(page.getByRole('alert')).toHaveText('Выберите улицу');
  await page.locator('#dom-street').fill('жеки');
  await page.getByRole('option').getByRole('button', { name: 'Жекибаева' }).click();
  await expect(page.locator('#dom-street')).toHaveValue('Жекибаева');
  await page.locator('#dom-house').fill('135');
  await page.locator('#dom-entrance').fill('3');
  await page.locator('#dom-flat').fill('41');
  expect(await noOverflow(page)).toBe(true);
  await page.screenshot({ path: info.outputPath('form.png'), fullPage: true });
  await page.getByTestId('dom-save').click();
  await expect(page.getByRole('alert')).toHaveText('Поставьте галочку согласия');
  await page.locator('#dom-consent').check();
  await page.getByTestId('dom-save').click();
  await expect(page.getByRole('heading', { name: 'ул. Жекибаева, 135' })).toBeVisible();
  expect(writes[0].save).toMatchObject({ street: 'Жекибаева', house: '135', entrance: '3', flat: '41', consent: true });
  await expect(page.getByText('Вы первый житель дома на портале')).toBeVisible();
  await expect(page.getByTestId('dom-write')).toHaveCount(0);
  // a real (tiny) JPEG goes through the canvas shrink
  const jpeg = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA0JCgsKCA0LCgsODg0PEyAVExISEyccHhcgLikxMC4pLSwzOko+MzZGNywtQFdBRkxOUlNSMj5aYVpQYEpRUk//2wBDAQ4ODhMREyYVFSZPNS01T09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0//wAARCAAeACgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDtqKKK3MAooooAKKKKACiiigAooooAKKKKAP/Z', 'base64');
  await page.getByTestId('dom-proof-input').setInputFiles({ name: 'receipt.jpg', mimeType: 'image/jpeg', buffer: jpeg });
  await expect(page.getByText('Квитанция получена')).toBeVisible();
  expect(writes.find((w) => w.proof).proof).toBe('data:image/jpeg;base64,');
  await page.getByRole('tab', { name: /Соседи/ }).click();
  await expect(page.getByText('Соседей видно после подтверждения')).toBeVisible();
  await page.screenshot({ path: info.outputPath('pending.png'), fullPage: true });
});

test('pending resident with neighbours sees progress and a WhatsApp reminder', async ({ page }) => {
  await setup(page, { auth: true, member: 'pending' });
  await page.goto('/dom');
  await expect(page.getByText('1 из 2')).toBeVisible();
  await expect(page.getByRole('link', { name: /Написать соседям в WhatsApp/ })).toHaveAttribute('href', /wa\.me\/\?text=.*sortirovka24\.kz%2Fdom/);
  await expect(page.getByTestId('dom-post')).toHaveCount(3);  // can read
  await page.getByTestId('dom-metoo').first().click();
  await expect(page.getByText('Отмечать можно после подтверждения адреса')).toBeVisible();
});

test('confirmed resident: feed, filters, «У меня тоже», write a post, neighbours and confirm one', async ({ page }, info) => {
  const writes = await setup(page, { auth: true, member: 'confirmed' });
  await page.goto('/dom');
  await expect(page.getByTestId('dom-post')).toHaveCount(3);
  const alarm = page.getByTestId('dom-post').first();
  await expect(alarm.getByRole('link', { name: /Куда звонить, если нет света/ })).toHaveAttribute('href', '/directory?s=power');
  await alarm.getByTestId('dom-metoo').click();
  await expect(alarm.getByTestId('dom-metoo')).toHaveAttribute('aria-pressed', 'true');
  await expect(alarm.getByTestId('dom-metoo')).toContainText('7');
  expect(writes.some((w) => w.metoo === 11)).toBe(true);
  expect(await noOverflow(page)).toBe(true);
  await page.screenshot({ path: info.outputPath('feed.png'), fullPage: true });

  await page.getByRole('button', { name: '📢 Объявление' }).click();
  await expect(page.getByTestId('dom-post')).toHaveCount(1);
  await page.getByRole('button', { name: 'Все', exact: true }).click();

  await page.getByTestId('dom-write').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.locator('[data-kind=alarm]').click();
  await page.locator('#dom-body').fill('Лифт в 3 подъезде застрял между этажами');
  await page.getByText('Только про 3 подъезд').click();
  await page.screenshot({ path: info.outputPath('compose.png') });
  await page.getByTestId('dom-send').click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByTestId('dom-post').first()).toContainText('Лифт в 3 подъезде');
  expect(writes.find((w) => w.post).post).toMatchObject({ kind: 'alarm', only_entrance: true });

  await page.getByRole('tab', { name: /Соседи/ }).click();
  await expect(page.getByText('3 подъезд — ваш')).toBeVisible();
  await expect(page.getByTestId('dom-waiting')).toBeVisible();
  await page.screenshot({ path: info.outputPath('people.png'), fullPage: true });
  await page.getByRole('button', { name: 'Да, это сосед' }).click();
  await expect(page.getByText('Нужно ещё одно подтверждение')).toBeVisible();
  expect(writes.some((w) => w.confirm === 21)).toBe(true);
});

test('post page: comments, reply, report', async ({ page }, info) => {
  const writes = await setup(page, { auth: true, member: 'confirmed' });
  await page.goto('/dom/post/11');
  await expect(page.getByText('Ответы соседей · 2')).toBeVisible();
  await expect(page.locator('.dom-thread li.is-author')).toContainText('Спасибо!');
  await page.locator('#dom-reply').fill('У меня тоже нет света');
  await page.getByTestId('dom-reply-send').click();
  await expect(page.getByText('Ответы соседей · 3')).toBeVisible();
  expect(writes.find((w) => w.comment).comment).toBe('У меня тоже нет света');
  await page.locator('.dom-thread li').first().getByRole('button', { name: 'Пожаловаться' }).click();
  await expect(page.getByText('Жалоба отправлена')).toBeVisible();
  expect(await noOverflow(page)).toBe(true);
  await page.screenshot({ path: info.outputPath('post.png'), fullPage: true });
});

test('settings: change address or delete everything', async ({ page }) => {
  const writes = await setup(page, { auth: true, member: 'confirmed' });
  await page.goto('/dom?edit=1');
  await expect(page.getByRole('heading', { name: 'Мой адрес' })).toBeVisible();
  await page.getByRole('button', { name: /Удалить мой адрес/ }).click();
  await page.getByTestId('dom-leave').click();
  await expect(page.getByRole('heading', { name: 'Где вы живёте?' })).toBeVisible();
  expect(writes.some((w) => w.leave)).toBe(true);
});

test('Kazakh + dark + small phone stay inside the screen', async ({ page }, info) => {
  await setup(page, { auth: true, member: 'confirmed', lang: 'kz', dark: true });
  await page.setViewportSize({ width: 340, height: 740 });
  await page.goto('/dom');
  await expect(page.getByRole('tab', { name: /Үй таспасы/ })).toBeVisible();
  await expect(page.getByTestId('dom-post')).toHaveCount(3);
  expect(await noOverflow(page)).toBe(true);
  await page.screenshot({ path: info.outputPath('kz-dark.png'), fullPage: true });
  await page.getByTestId('dom-write').click();
  await page.waitForTimeout(400);
  await expect(page.getByRole('button', { name: 'Жариялау' })).toBeInViewport();
  expect(await noOverflow(page)).toBe(true);
  await page.screenshot({ path: info.outputPath('kz-dark-compose.png') });
});

test('desktop: house page and compose dialog are centred and readable', async ({ page }, info) => {
  await setup(page, { auth: true, member: 'confirmed' });
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto('/dom');
  await expect(page.getByTestId('dom-post')).toHaveCount(3);
  expect(await noOverflow(page)).toBe(true);
  await page.screenshot({ path: info.outputPath('desktop.png') });
  await page.getByTestId('dom-write').click();
  await page.waitForTimeout(400);
  await expect(page.getByTestId('dom-send')).toBeInViewport();
  await page.screenshot({ path: info.outputPath('desktop-compose.png') });
});
