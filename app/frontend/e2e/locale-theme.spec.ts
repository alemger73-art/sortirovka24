import { test, expect, type Page } from '@playwright/test';

async function setup(page: Page, lang: 'ru' | 'kz' = 'kz', theme = 'dark') {
  await page.addInitScript(({lang,theme}) => {
    if (!localStorage.getItem('app_lang')) localStorage.setItem('app_lang', lang);
    if (!localStorage.getItem('sortirovka-theme')) localStorage.setItem('sortirovka-theme', theme);
    sessionStorage.setItem('s24_welcome_done', '1');
  }, {lang,theme});
  await page.route('**/*', r => ['127.0.0.1', 'localhost'].includes(new URL(r.request().url()).hostname) || r.request().url().includes('/api/') ? r.continue() : r.abort());
  await page.route('**/api/**', r => {
    const path = new URL(r.request().url()).pathname;
    let json: unknown = {items: [], total: 0};
    if (path.includes('/settings') || path.includes('/modules')) json = {};
    if (path.includes('/support/settings')) json = {promo_enabled: true, recipient: '', bank: '', iban: '', bin: '', kaspi_phone: '', kaspi_qr_url: '', purpose: '', contact_email: ''};
    if (path.includes('/taxi/settings')) json = {enabled: true};
    if (path.endsWith('/inspector-directory')) json = {revision: 0, department_name: '', address: '', duty_phone: '', duty_whatsapp: '', map_url: '', reception_schedule: '', source_url: '', verified_on: null, notice: '', tips: []};
    if (path.endsWith('/prorab/catalog')) json = {categories: [], products: [], settings: {default_address: '', delivery_time: '30–60', min_order: '0', hero_title: '', store_name: 'PRORAB', store_tagline: ''}};
    if (path.includes('food_restaurants')) json = {items: [{id: 1, name: 'DAM ALEM 2.0'}]};
    if (path === '/api/categories') json = {categories: [{id: 1, name: 'Pizza', slug: 'pizza'}]};
    if (path === '/api/products') json = {products: [{id: 1, category_id: 1, title: 'Margherita', description: '', image: '/icon-512.png', price: 2500, available: true}]};
    if (path.includes('food_settings')) json = {items: Object.entries({min_order_amount: '0', service_fee_rate: '0', free_delivery_from: '8000', promo_codes: '[]', loyalty_gifts: '[]', kitchen_open: '00:00', kitchen_close: '00:00'}).map(([setting_key, setting_value]) => ({setting_key, setting_value}))};
    return r.fulfill({json});
  });
}

const routes = ['/', '/more', '/account', '/food', '/gastronom', '/volna', '/prorab', '/apteka', '/masters', '/salons', '/news', '/complaints', '/announcements', '/real-estate', '/jobs', '/questions', '/directory', '/inspectors', '/transport', '/taxi', '/history', '/support', '/report-problem', '/admin', '/partner/dam-alem'];
for (const route of routes) {
  test(`Kazakh dark screen ${route}`, async ({page}, info) => {
    const errors: string[] = [], missing: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.text().includes('[i18n] Missing')) missing.push(m.text()); });
    await setup(page);
    await page.goto(route, {waitUntil: 'domcontentloaded'});
    await expect(page.locator('html')).toHaveAttribute('lang', 'kk');
    await expect(page.locator('html')).toHaveClass(/dark/);
    await expect(page.locator('h1,h2,h3').filter({visible:true}).first()).toBeVisible();
    await page.waitForTimeout(350);
    expect(errors).toEqual([]);
    expect(missing).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'horizontal overflow').toBe(true);
    // Brand images and small accent buttons may be bright; content panels must follow the theme.
    const whitePanels = await page.evaluate(() => [...document.querySelectorAll('main div, form, section, header')].filter(el => {
      const r = el.getBoundingClientRect(), s = getComputedStyle(el), rgba = s.backgroundColor.match(/[\d.]+/g)?.map(Number) || [];
      return r.width * r.height > 30000 && r.top < innerHeight && r.bottom > 0 && s.visibility !== 'hidden' && s.opacity !== '0' && (rgba.length === 3 || rgba[3] > .9) && rgba.slice(0,3).every(c => c > 225);
    }).map(el => el.className));
    expect(whitePanels, 'light panels in dark mode').toEqual([]);
    if (['/', '/food', '/directory', '/account', '/admin'].includes(route)) await page.screenshot({path: info.outputPath(`${route.slice(1) || 'home'}-kk-dark.png`), animations: 'disabled'});
  });
}

test('language and theme switches survive reload and navigation', async ({page}) => {
  await setup(page, 'ru', 'light');
  await page.goto('/more');
  await page.locator('header button').filter({has: page.locator('svg.lucide-moon')}).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.locator('header button').filter({has: page.locator('svg.lucide-globe')}).click();
  await expect(page.locator('html')).toHaveAttribute('lang','kk');
  await expect(page.getByRole('heading', {name:'Тағы',exact:true})).toBeVisible();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang','kk');
  await expect(page.locator('html')).toHaveClass(/dark/);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe('dark');
  await page.locator('header button').filter({has: page.locator('svg.lucide-sun')}).click();
  await expect(page.locator('html')).not.toHaveClass(/dark/);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe('light');
});

test('food cart and checkout use dark surfaces in Kazakh', async ({page}, info) => {
  await setup(page);
  await page.goto('/food');
  const card = page.locator('.dam-grid-card').first();
  await expect(card).toBeVisible();
  await card.locator('.dam-grid-card__add').click();
  await page.getByTestId('dam-cart-open').click();
  await expect(page.getByTestId('dam-cart-checkout')).toBeEnabled();
  await page.getByTestId('dam-cart-checkout').click();
  const checkout = page.getByTestId('dam-checkout');
  await expect(checkout).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await expect(checkout).not.toContainText(/Оформление заказа|Ваше имя|Номер телефона|Способ оплаты/);
  await page.screenshot({path: info.outputPath('checkout-kk-dark.png'), animations:'disabled'});
});


test('native status bar follows the selected theme', async ({page}) => {
  await setup(page);
  await page.addInitScript(() => {
    const w=window as any;w.statusStyles=[];w.androidBridge={};
    w.Capacitor={PluginHeaders:[{name:'StatusBar',methods:[{name:'setStyle',rtype:'promise'}]}],nativePromise:async(plugin:string,method:string,args:any)=>{
      if(plugin==='StatusBar'&&method==='setStyle'){w.statusStyles.push(args.style);return {};}
      throw new Error('Test plugin unavailable');
    }};
  });
  await page.goto('/more');
  await expect.poll(()=>page.evaluate(()=>(window as any).statusStyles.at(-1))).toBe('DARK');
  await page.locator('header button').filter({has:page.locator('svg.lucide-sun')}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).statusStyles.at(-1))).toBe('LIGHT');
});
