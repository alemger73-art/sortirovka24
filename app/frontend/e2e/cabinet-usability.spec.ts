import { test, expect, type Page } from '@playwright/test';
import { parseOrderItems, orderLineTotal } from '../src/lib/orderRoutes';

const profile = { id: 'mine', name: 'Тестовый пользователь', phone: '+77011234567', email: 'test@example.com', language: 'ru', avatar: '', role: 'user', has_password: true, bonus_balance: 450 };
const order = { id: 'food_42', type: 'food', order_number: 42, restaurant_name: 'DAM ALEM 2.0', status: 'done', amount: 5600, order_items: JSON.stringify([{ name: 'Пицца', price: 2500, modTotal: 300, quantity: 2 }]), created_at: '2026-09-11T12:00:00Z' };
async function setup(page: Page) {
  const state = { profile: { ...profile }, addresses: [] as Array<Record<string, any>>, writes: [] as Array<{ path: string; body: any }>, failCabinet: 0, failNotifications: false, notifications: [{ id: 1, title: 'Заказ доставлен', category: 'food', is_read: false, body: 'Спасибо за заказ', path: '' }] };
  await page.addInitScript(p => {
    localStorage.setItem('account_token', 'cabinet-test-token');
    localStorage.setItem('account_user_profile', JSON.stringify(p));
  }, profile);
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' || route.request().url().includes('/api/') ? route.continue() : route.abort());
  await page.route('**/api/**', async route => {
    const req = route.request(), path = new URL(req.url()).pathname;
    const method = req.method();
    let body: any = { items: [], total: 0 };
    if (path.endsWith('/account/cabinet')) {
      if (state.failCabinet) return route.fulfill({ status: state.failCabinet, json: { detail: state.failCabinet === 401 ? 'Сессия истекла' : 'Сервер временно недоступен' } });
      body = { profile: state.profile, addresses: state.addresses, orders: [order], bonuses: [{ id: 1, points: 450, reason: 'Начисление', created_at: order.created_at }], complaints: [], announcements: [], real_estate: [], master_requests: [], become_master_requests: [] };
    }
    if (path.endsWith('/account/me')) {
      if (method === 'PUT') { const patch = req.postDataJSON(); state.writes.push({ path, body: patch }); Object.assign(state.profile, patch); }
      body = state.profile;
    }
    if (path.endsWith('/account/me/addresses/geocode')) body = { found: true, lat: 49.8, lng: 73.1, display_address: 'Первый адрес' };
    else if (path.includes('/account/me/addresses')) {
      const parts = path.split('/');
      const id = Number(parts.at(-1) === 'default' ? parts.at(-2) : parts.at(-1));
      if (method === 'GET') body = state.addresses;
      if (method === 'POST' && path.endsWith('/addresses')) {
        const entry = { ...req.postDataJSON(), id: state.addresses.length + 1 };
        if (entry.is_default) state.addresses.forEach(a => a.is_default = false);
        state.addresses.push(entry); body = entry; state.writes.push({ path, body: entry });
      }
      if (method === 'PUT') { const entry = state.addresses.find(a => a.id === id)!; Object.assign(entry, req.postDataJSON()); body = entry; }
      if (method === 'DELETE') { state.addresses = state.addresses.filter(a => a.id !== id); body = { success: true }; }
      if (path.endsWith('/default')) { state.addresses.forEach(a => a.is_default = a.id === id); body = state.addresses.find(a => a.id === id); }
    }
    if (path.endsWith('/account/notifications')) {
      if (state.failNotifications) return route.fulfill({ status: 500, json: { detail: 'Уведомления недоступны' } });
      body = { unread_count: state.notifications.filter(n => !n.is_read).length, items: state.notifications };
    }
    if (path.includes('/account/notifications/') && method === 'POST') { state.writes.push({ path, body: {} }); state.notifications.forEach(n => n.is_read = true); body = { success: true }; }
    if (path.endsWith('/account/orders/food/42')) body = { ...order, store_label: 'DAM ALEM 2.0', delivery_method: 'pickup' };
    if (path.endsWith('/taxi/rides/my')) body = [];
    if (path.endsWith('/taxi/settings')) body = { enabled: true };
    if (path.endsWith('/courier/access')) body = { can_access_cabinet: false, status: 'none' };
    if (path.endsWith('/driver/application')) body = { is_driver: false, status: 'none' };
    if (path.endsWith('/change-password')) { state.writes.push({ path, body: req.postDataJSON() }); body = { success: true }; }
    await route.fulfill({ json: body });
  });
  return state;
}

test('all resident tabs fit, preserve URL and navigate back', async ({ page }, info) => {
  await setup(page);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/cabinet');
  const nav = page.getByRole('navigation', { name: 'Разделы личного кабинета' });
  await expect(page.getByLabel('Имя', { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('cabinet-profile.png'), fullPage: true });
  const choose = async (label: string) => {
    const select = nav.getByRole('combobox');
    if (await select.isVisible()) await select.selectOption({ label });
    else await nav.getByRole('button', { name: label }).click();
  };
  for (const label of ['Адреса доставки', 'Бонусы', 'Уведомления', 'История заказов', 'Заявки мастерам', 'Поездки такси', 'История жалоб', 'Мои объявления', 'Моя недвижимость', 'Настройки']) {
    await choose(label);
    await expect(nav.locator('button[aria-current=page]')).toContainText(label);
    await expect(page.locator('#cabinet-panel')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.reload();
  await expect(nav.locator('button[aria-current=page]')).toHaveText('Настройки');
  await choose('Профиль');
  await page.goBack();
  await expect(nav.locator('button[aria-current=page]')).toHaveText('Настройки');
  expect(errors).toEqual([]);
});

test('profile clears email, validates fields, preserves successful save', async ({ page }) => {
  const state = await setup(page);
  await page.goto('/cabinet');
  await page.getByLabel('Имя', { exact: true }).fill('');
  await page.getByRole('button', { name: 'Сохранить изменения' }).click();
  await expect(page.getByRole('alert')).toContainText('Укажите имя');
  expect(state.writes).toHaveLength(0);
  await page.getByLabel('Имя', { exact: true }).fill('Новое имя');
  await page.getByLabel('Email', { exact: true }).fill('');
  // A saved profile must not depend on a second successful cabinet GET.
  state.failCabinet = 500;
  await page.getByRole('button', { name: 'Сохранить изменения' }).click();
  await expect(page.getByRole('status')).toContainText('Профиль сохранён');
  expect(state.profile.email).toBe('');
  await expect(page.getByRole('heading', { name: 'Новое имя' })).toBeVisible();
});

test('load errors never invent zero balances and retry restores history', async ({ page }) => {
  const state = await setup(page); state.failCabinet = 500;
  await page.goto('/cabinet?tab=bonuses');
  await expect(page.getByRole('heading', { name: 'Не удалось загрузить личный кабинет' })).toBeVisible();
  await expect(page.locator('.cabinet-page')).toHaveCount(0);
  state.failCabinet = 0;
  await page.getByRole('button', { name: 'Попробовать снова' }).click();
  await expect(page.locator('#cabinet-panel')).toContainText('450');
  state.failCabinet = 401;
  await page.reload();
  await expect(page).toHaveURL(/\/account/);
  expect(await page.evaluate(() => localStorage.getItem('account_token'))).toBeNull();
});

test('address changes ignore stale map response and CRUD stays in sync', async ({ page }) => {
  const state = await setup(page);
  let release!: () => void;
  const gate = new Promise<void>(resolve => release = resolve);
  await page.route('**/account/me/addresses/geocode', async route => { await gate; await route.fulfill({ json: { found: true, lat: 49.8, lng: 73.1, display_address: 'Старый адрес' } }); });
  await page.goto('/cabinet?tab=addresses');
  await page.getByRole('button', { name: 'Добавить адрес', exact: true }).click();
  const address = page.getByLabel('Адрес: улица, дом, квартира', { exact: true });
  await address.fill('Первый адрес, 1');
  try {
    await page.getByRole('button', { name: 'На карте', exact: true }).click();
    await address.fill('Новый адрес, 2');
  } finally { release(); }
  await expect(page.getByRole('button', { name: 'Сохранить', exact: true })).toBeEnabled();
  await expect(page.getByText('Старый адрес', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.locator('#cabinet-panel')).toContainText('Новый адрес, 2');
  expect(state.addresses[0]).toMatchObject({ address: 'Новый адрес, 2', lat: null, lng: null });
  await page.getByRole('button', { name: 'Редактировать', exact: true }).click();
  await address.fill('Изменённый адрес, 3');
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.locator('#cabinet-panel')).toContainText('Изменённый адрес, 3');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Удалить', exact: true }).click();
  await expect(page.getByText('Изменённый адрес, 3', { exact: true })).toHaveCount(0);
  expect(state.addresses).toHaveLength(0);
});

test('notification failures offer retry and reading is not duplicated', async ({ page }) => {
  const state = await setup(page); state.failNotifications = true;
  await page.goto('/cabinet?tab=notifications');
  await expect(page.getByRole('alert')).toContainText('Уведомления недоступны');
  state.failNotifications = false;
  await page.getByRole('button', { name: 'Попробовать снова' }).click();
  await page.getByRole('button', { name: /Заказ доставлен/ }).dblclick();
  await expect.poll(() => state.writes.filter(w => w.path.endsWith('/read')).length).toBe(1);
  await expect(page.getByRole('button', { name: 'Прочитать все' })).toHaveCount(0);
});

test('six digit PIN unlocks cabinet and direct order detail', async ({ page }) => {
  await setup(page);
  await page.goto('/cabinet?tab=settings');
  await page.getByPlaceholder('Придумайте PIN').fill('123456');
  await page.getByPlaceholder('Повторите PIN').fill('123456');
  await page.getByRole('button', { name: 'Сохранить PIN', exact: true }).click();
  await expect(page.getByText('PIN установлен', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('textbox', { name: 'PIN-код' }).fill('123456');
  await page.getByRole('button', { name: 'PIN-код', exact: true }).click();
  await expect(page.getByText('PIN установлен', { exact: true })).toBeVisible();
  await page.evaluate(() => sessionStorage.removeItem('cabinet_unlocked_session'));
  await page.goto('/cabinet/orders/food/42');
  await expect(page.getByRole('textbox', { name: 'PIN-код' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'DAM ALEM 2.0' })).toHaveCount(0);
  await page.getByRole('textbox', { name: 'PIN-код' }).fill('123456');
  await page.getByRole('button', { name: 'PIN-код', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'DAM ALEM 2.0' })).toBeVisible();
  await expect(page.locator('li').filter({ hasText: 'Пицца × 2' })).toContainText(/5\s*600/);
});

test('password validation prevents invalid requests and clears successful form', async ({ page }) => {
  const state = await setup(page);
  await page.goto('/cabinet?tab=settings');
  await page.getByPlaceholder('Текущий пароль').fill('OldPassword1');
  await page.getByPlaceholder('Новый пароль (мин. 8 символов)').fill('NewPassword1');
  await page.getByPlaceholder('Повторите новый пароль').fill('different');
  await page.getByRole('button', { name: 'Смена пароля', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  expect(state.writes).toHaveLength(0);
  await page.getByPlaceholder('Повторите новый пароль').fill('NewPassword1');
  await page.getByRole('button', { name: 'Смена пароля', exact: true }).click();
  await expect(page.getByRole('status')).toBeVisible();
  expect(state.writes.filter(w => w.path.endsWith('/change-password'))).toHaveLength(1);
  await expect(page.getByPlaceholder('Текущий пароль')).toHaveValue('');
});

test('malformed order payloads do not crash history and totals include extras', () => {
  expect(parseOrderItems('[null,1,"text",{"name":"Пицца"}]')).toEqual([{ name: 'Пицца' }]);
  expect(parseOrderItems('broken')).toEqual([]);
  expect(orderLineTotal({ price: 2500, modTotal: 300, quantity: 2 })).toBe(5600);
  expect(orderLineTotal({ price: 2500, total: 1000, quantity: 2 })).toBe(1000);
});

test('avatar upload preserves unsaved text and removal updates the header', async ({ page }) => {
  const state = await setup(page);
  const image = 'http://127.0.0.1:3174/food-hero-reference.png';
  let release!: () => void;
  const gate = new Promise<void>(resolve => release = resolve);
  await page.route('**/account/me/avatar-upload-url', route => route.fulfill({ json: { upload_url: 'http://127.0.0.1:3174/api/avatar-test' } }));
  await page.route('**/api/avatar-test', async route => { await gate; await route.fulfill({ json: { image_url: image } }); });
  await page.goto('/cabinet');
  try {
    await page.locator('input[type=file]').setInputFiles('public/food-hero-reference.png');
    await expect(page.getByRole('button', { name: 'Сохранить изменения' })).toBeDisabled();
    await page.getByLabel('Имя', { exact: true }).fill('Имя в процессе редактирования');
  } finally { release(); }
  await expect(page.getByRole('button', { name: 'Сохранить изменения' })).toBeEnabled();
  await expect(page.getByLabel('Имя', { exact: true })).toHaveValue('Имя в процессе редактирования');
  expect(state.writes.at(-1)?.body).toEqual({ avatar: image });
  await page.getByRole('button', { name: 'Удалить фото', exact: true }).click();
  await expect(page.locator('.cabinet-page img')).toHaveCount(0);
  expect(state.profile.avatar).toBe('');
});

test('device preference save errors are visible and logout clears session', async ({ page }) => {
  await setup(page);
  await page.goto('/cabinet?tab=settings');
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key === 'cabinet_security_v1') throw new DOMException('full', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  });
  await page.getByPlaceholder('Придумайте PIN').fill('123456');
  await page.getByPlaceholder('Повторите PIN').fill('123456');
  await page.getByRole('button', { name: 'Сохранить PIN', exact: true }).click();
  await expect(page.getByRole('alert').first()).toContainText('Не удалось сохранить');
  await expect(page.getByText('PIN установлен', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Выход', exact: true }).click();
  await expect(page).toHaveURL(/\/account/);
  expect(await page.evaluate(() => localStorage.getItem('account_token') || localStorage.getItem('s24_account_token_v1') || sessionStorage.getItem('s24_account_token_v1'))).toBeNull();
});

test('narrow native screen fits profile and settings with enlarged text', async ({ page }, info) => {
  await setup(page);
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/cabinet');
  await page.getByLabel('Имя', { exact: true }).fill('Очень длинное имя пользователя без потери информации');
  await page.evaluate(() => { document.documentElement.classList.add('native-app'); document.documentElement.style.fontSize = '18px'; (document.activeElement as HTMLElement)?.blur(); window.scrollTo(0, 0); });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await page.locator('.site-header > div').boundingBox())!.y).toBeGreaterThanOrEqual(32);
  await page.getByLabel('Раздел кабинета').selectOption('settings');
  await expect(page.getByPlaceholder('Придумайте PIN')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('cabinet-native-320.png'), fullPage: true });
});

test('own listings handle failed writes and can be hidden and deleted', async ({ page }) => {
  await setup(page);
  for (const [tab, field, routeName] of [['announcements', 'announcements', 'announcements'], ['realEstate', 'real_estate', 'real-estate']]) {
    const entry = { id: 1, title: 'Тестовая публикация', status: 'approved', ann_type: 'sell', active: true };
    let present = true, fail = true, writes = 0;
    await page.route('**/account/cabinet', route => route.fulfill({ json: { profile, orders: [], [field]: present ? [entry] : [] } }));
    await page.route(`**/account/me/${routeName}/1**`, route => {
      writes++;
      if (fail) { fail = false; return route.fulfill({ status: 500, json: { detail: 'Ошибка сохранения' } }); }
      if (route.request().method() === 'DELETE') present = false;
      else entry.status = 'draft';
      return route.fulfill({ json: { success: true } });
    });
    await page.goto(`/cabinet?tab=${tab}`);
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'Снять', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Ошибка сохранения');
    expect(writes).toBe(1);
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'Снять', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Снять', exact: true })).toHaveCount(0);
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'Удалить', exact: true }).click();
    await expect(page.getByText('Тестовая публикация', { exact: true })).toHaveCount(0);
    expect(writes).toBe(3);
  }
});
