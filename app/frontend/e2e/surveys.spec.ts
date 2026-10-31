import { test, expect, type Page } from '@playwright/test';

const profile = { id: 'alice', name: 'Алия', phone: '+77001234567', role: 'user' };
const questions = [
  { id: 'q1', type: 'multi', text: 'Чего вам больше всего не хватает в районе?', required: true, other: true, options: ['Кафе', 'Аптека 24/7', 'Спортзал'] },
  { id: 'q2', type: 'single', text: 'Где вы покупаете продукты?', required: true, other: false, options: ['Магазин у дома', 'Сетевые', 'Рынок'] },
  { id: 'q3', type: 'scale', text: 'Насколько нравится жить в Сортировке?', required: true, low: 'Совсем нет', high: 'Очень' },
  { id: 'q4', type: 'check', text: 'Проверочный вопрос: отметьте «Сортировка»', required: true, options: ['Майкудук', 'Сортировка'] },
  { id: 'q5', type: 'text', text: 'Что сделать в первую очередь?', required: false },
];

async function setup(page: Page, opts: { auth?: boolean; verified?: boolean; lang?: string } = {}) {
  const sent: any[] = [];
  await page.addInitScript(({ profile, auth, lang }) => {
    localStorage.setItem('app_lang', lang || 'ru'); sessionStorage.setItem('s24_welcome_done', '1');
    if (auth) { localStorage.setItem('account_token', 'test-token'); localStorage.setItem('account_user_profile', JSON.stringify(profile)); }
  }, { profile, auth: opts.auth, lang: opts.lang });
  await page.route('**/*', (r) => (new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort()));
  await page.route('**/api/**', async (route) => {
    const req = route.request(), path = new URL(req.url()).pathname;
    const json = (j: unknown, status = 200) => route.fulfill({ status, json: j });
    if (path.endsWith('/account/me') || path.endsWith('/auth/me')) return json(profile);
    if (path.endsWith('/surveys')) return json({ items: [{ id: 7, title: 'Чего не хватает в Сортировке?', intro: 'Помогите решить, что открыть в районе. 2 минуты.', questions: 5, minutes: 1, reward: 500, places_left: 42, done: false }] });
    if (path.endsWith('/surveys/7') && req.method() === 'GET') return json({ id: 7, title: 'Чего не хватает в Сортировке?', intro: 'Помогите решить, что открыть в районе.', questions, reward: 500, done: false, phone_verified: opts.verified !== false, bonus_days: 30 });
    if (path.endsWith('/surveys/7') && req.method() === 'POST') {
      sent.push(req.postDataJSON());
      return json({ ok: true, rewarded: 500, valid: true, message: '500 бонусов уже на вашем счёте — их можно потратить в DÄM ALEM в течение 30 дней.' });
    }
    return json(req.method() === 'GET' ? { items: [], total: 0 } : { ok: true });
  });
  return sent;
}

test('home banner → survey one question at a time → 500 bonuses', async ({ page }, info) => {
  const sent = await setup(page, { auth: true });
  await page.goto('/');
  await expect(page.getByTestId('home-survey')).toContainText('+500 бонусов за опрос');
  await page.getByTestId('home-survey').click();
  await expect(page).toHaveURL(/\/surveys\/7$/);
  await expect(page.getByText('+500 бонусов в DÄM ALEM')).toBeVisible();
  await page.getByTestId('survey-start').click();

  const next = page.getByTestId('survey-next');
  await expect(page.getByText('Вопрос 1 из 5')).toBeVisible();
  await expect(next).toBeDisabled();                       // a required question must be answered
  await page.getByRole('checkbox', { name: 'Кафе' }).click();
  await page.getByRole('checkbox', { name: 'Спортзал' }).click();
  await page.getByLabel('Свой вариант').fill('Бассейн');
  await page.screenshot({ path: info.outputPath('survey-question.png') });
  await next.click();
  await page.getByRole('radio', { name: 'Рынок' }).click();
  await next.click();
  await page.getByRole('radio', { name: '4' }).click();
  await next.click();
  await page.getByRole('radio', { name: 'Сортировка' }).click();
  await next.click();
  await expect(page.getByText('можно пропустить')).toBeVisible();
  await page.getByRole('button', { name: 'Назад' }).click();  // going back keeps the answer
  await expect(page.getByRole('radio', { name: 'Сортировка' })).toHaveAttribute('aria-checked', 'true');
  await next.click();
  await page.getByTestId('survey-send').click();

  await expect(page.getByTestId('survey-finish')).toContainText('+500');
  await expect(page.getByTestId('survey-finish')).toContainText('DÄM ALEM');
  expect(sent[0].answers).toEqual({ q1: { choices: [0, 2], other: 'Бассейн' }, q2: { choices: [2] }, q3: { value: 4 }, q4: { choices: [1] } });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: info.outputPath('survey-done.png') });
});

test('guest is asked to sign in; unverified phone is told how to get the bonus', async ({ page }) => {
  await setup(page);
  await page.goto('/surveys');
  await expect(page.getByTestId('survey-card')).toContainText('+500 бонусов');
  await page.getByTestId('survey-card').click();
  await expect(page.getByTestId('survey-login')).toHaveAttribute('href', '/account?redirect=%2Fsurveys%2F7');

  const page2 = await page.context().newPage();
  await setup(page2, { auth: true, verified: false, lang: 'kz' });
  await page2.goto('/surveys/7');
  await expect(page2.getByText('Бонус алу үшін телефон нөмірін растаңыз')).toBeVisible();
});

test('admin: builder, launch, results with bars and Excel download', async ({ page }, info) => {
  const writes: any[] = [];
  let items = [{ id: 1, title: 'Чего не хватает в Сортировке?', intro: 'Помогите решить', questions, reward: 500, max_rewards: null, status: 'draft', created_at: '', started_at: null, closed_at: null, counts: { total: 0, valid: 0, rewarded: 0 }, bonus_spent: 0 }];
  await page.addInitScript(() => { localStorage.setItem('_sp924_token', 'test-admin'); localStorage.setItem('app_lang', 'ru'); });
  await page.route('**/*', (r) => (new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort()));
  await page.routeWebSocket('**/ws/**', (ws) => ws.close());
  await page.route('**/api/**', async (route) => {
    const req = route.request(), path = new URL(req.url()).pathname, m = req.method();
    if (path.includes('verify-session')) return route.fulfill({ json: { valid: true, username: 'owner' } });
    if (path.includes('/surveys/admin')) {
      if (m !== 'GET') writes.push({ m, path, body: req.postDataJSON?.() ?? null });
      if (path.endsWith('/status')) items = items.map((s) => ({ ...s, status: 'active', counts: { total: 3, valid: 2, rewarded: 2 }, bonus_spent: 1000 }));
      if (m === 'POST' && path.endsWith('/surveys/admin')) items = [...items, { ...items[0], ...req.postDataJSON(), id: 2, status: 'draft', counts: { total: 0, valid: 0, rewarded: 0 }, bonus_spent: 0 }];
      if (path.endsWith('/results.csv')) return route.fulfill({ body: '﻿№;Дата', contentType: 'text/csv' });
      if (path.endsWith('/results')) return route.fulfill({ json: {
        survey: { id: 1, title: items[0].title, status: 'active', reward: 500, max_rewards: null }, counts: { total: 3, valid: 2, rewarded: 2 },
        rejected: { too_fast: 1, check_failed: 0 },
        questions: [
          { id: 'q1', type: 'multi', text: questions[0].text, answered: 2, options: [{ label: 'Кафе', count: 2 }, { label: 'Аптека 24/7', count: 1 }, { label: 'Спортзал', count: 0 }, { label: 'Свой вариант', count: 1 }], texts: ['Бассейн'] },
          { id: 'q3', type: 'scale', text: questions[2].text, answered: 2, average: 4.5, low: 'Совсем нет', high: 'Очень', options: [1, 2, 3, 4, 5].map((n) => ({ label: String(n), count: n >= 4 ? 1 : 0 })) },
          { id: 'q5', type: 'text', text: questions[4].text, answered: 1, texts: ['Отремонтировать дороги'] },
        ] } });
      return route.fulfill({ json: { items } });
    }
    return route.fulfill({ json: m === 'GET' ? { items: [], total: 0 } : { ok: true } });
  });

  await page.goto('/admin?tab=surveys');
  const root = page.getByTestId('admin-surveys');
  await expect(root).toContainText('Черновик');
  await page.getByRole('button', { name: 'Запустить' }).click();
  await expect(root).toContainText('Идёт');
  await expect(page.getByTestId('survey-row')).toContainText('выдано бонусов 1 000');

  await page.getByRole('button', { name: 'Результаты' }).click();
  const res = page.getByTestId('survey-results');
  await expect(res).toContainText('Засчитано ответов: 2');
  await expect(res).toContainText('слишком быстро — 1');
  await expect(res).toContainText('средняя оценка 4.5');
  await expect(res).toContainText('Отремонтировать дороги');
  await expect(res).not.toContainText('Проверочный');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Скачать для Excel' }).click();
  expect((await download).suggestedFilename()).toMatch(/^opros-1-\d{4}-\d{2}-\d{2}\.csv$/);
  await page.screenshot({ path: info.outputPath('survey-results.png'), fullPage: true });

  await page.getByRole('button', { name: 'Назад к опросам' }).click();
  await page.getByRole('button', { name: 'Новый опрос' }).click();
  const ed = page.getByTestId('survey-editor');
  await ed.getByLabel('Название').fill('Баня на Сортировке');
  await ed.getByLabel('Текст вопроса').fill('Ходите ли вы в баню?');
  await ed.getByLabel('Вариант 1').fill('Да');
  await ed.getByLabel('Вариант 2').fill('Нет');
  await ed.getByRole('button', { name: 'Добавить вопрос' }).click();
  await ed.getByLabel('Тип вопроса').nth(1).selectOption('check');
  await ed.getByLabel('Текст вопроса').nth(1).fill('Отметьте «Нет»');
  await ed.getByLabel('Вариант 1').nth(1).fill('Да');
  await ed.getByLabel('Вариант 2').nth(1).fill('Нет');
  await ed.getByLabel('Правильный вариант').nth(1).check();
  await ed.getByRole('button', { name: 'Сохранить' }).click();
  await expect(ed).toBeHidden();
  const created = writes.find((w) => w.m === 'POST' && w.path.endsWith('/surveys/admin'));
  expect(created.body.title).toBe('Баня на Сортировке');
  expect(created.body.questions[1]).toMatchObject({ type: 'check', text: 'Отметьте «Нет»', options: ['Да', 'Нет'], answer: 1 });
});
