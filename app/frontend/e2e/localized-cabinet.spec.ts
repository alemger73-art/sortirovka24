import { test, expect, type Page } from '@playwright/test';
import { parseOrderItems, orderLineTotal } from '../src/lib/orderRoutes';

const profile = { id: 'mine', name: 'Тестовый пользователь', phone: '+77011234567', email: 'test@example.com', language: 'kz', avatar: '', role: 'user', has_password: true, bonus_balance: 450 };
const order = { id: 'food_42', type: 'food', order_number: 42, restaurant_name: 'DAM ALEM 2.0', status: 'done', amount: 5600, order_items: JSON.stringify([{ name: 'Пицца', price: 2500, modTotal: 300, quantity: 2 }]), created_at: '2026-09-11T12:00:00Z' };
async function setup(page: Page) {
  const state = { profile: { ...profile }, addresses: [] as Array<Record<string, any>>, writes: [] as Array<{ path: string; body: any }>, failCabinet: 0, failNotifications: false, notifications: [{ id: 1, title: 'Заказ доставлен', category: 'food', is_read: false, body: 'Спасибо за заказ', path: '' }] };
  await page.addInitScript(p => {
    localStorage.setItem('app_lang','kz');localStorage.setItem('sortirovka-theme','dark');localStorage.setItem('account_token', 'cabinet-test-token');
    localStorage.setItem('account_user_profile', JSON.stringify(p));
  }, profile);
  await page.route('**/*', route => ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) || route.request().url().includes('/api/') ? route.continue() : route.abort());
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

test('all customer cabinet tabs support Kazakh dark mode', async ({page}, info) => {
  await setup(page);
  const errors: string[]=[];
  page.on('pageerror', e=>errors.push(e.message));
  page.on('console',m=>{if(m.text().includes('[i18n] Missing'))errors.push(m.text());});
  await page.goto('/cabinet');
  const nav=page.locator('.cabinet-nav');
  await expect(nav).toBeVisible();
  const values=await nav.locator('select option').evaluateAll(options=>options.map(o=>(o as HTMLOptionElement).value));
  for(const value of values){
    if(await nav.locator('select').isVisible())await nav.locator('select').selectOption(value);
    else {const index=values.indexOf(value);await nav.locator('ul button').nth(index).click();}
    await expect(page.locator('#cabinet-panel')).toBeVisible();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await expect(page.locator('html')).toHaveAttribute('lang','kk');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  }
  await page.screenshot({path:info.outputPath('cabinet-settings-kk-dark.png'),animations:'disabled'});
  expect(errors).toEqual([]);
});
