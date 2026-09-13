import { test, expect, type Page } from '@playwright/test';
import { emptyDirectory } from '../src/lib/inspectorDirectory';
const tabs = ['dashboard','news','banners','complaints','history','announcements','real-estate','jobs','masters','salons','master-requests','become-master','dam-alem','park-points','park-orders','directory','inspectors','taxi','logistics','transport','partners-business','partners-gastronom','partners-volna','partners-prorab','partners-pharmacy','modules','stats','categories','support','push','account-settings'];
const counters = { master_requests_new:0, become_master_pending:0, announcements_pending:0, complaints_new:0, real_estate_pending:0, jobs_pending:0, food_orders_new:0, park_orders_active:0, taxi_applications_pending:0, courier_applications_pending:0, business_partner_new:0 };
async function setup(page: Page) {
  const state = { failSummary:false, failModules:false, writes:0, summary:{...counters,total_pending:0,updated_at:'2026-09-13T10:00:00Z',recent:[]} };
  await page.addInitScript(() => {localStorage.setItem('_sp924_token','test-admin');localStorage.setItem('token','test-admin');localStorage.setItem('app_lang','ru');});
  await page.route('**/*', r => new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort());
  await page.routeWebSocket('**/ws/**', ws => ws.close());
  await page.route('**/api/**', async r => {
    const p=new URL(r.request().url()).pathname;
    if (!['GET','OPTIONS'].includes(r.request().method()) && !p.includes('verify-session')) state.writes++;
    if ((p.endsWith('/admin/summary') && state.failSummary) || (p.endsWith('/modules/admin/settings') && state.failModules)) return r.fulfill({status:503,json:{detail:'Test outage'}});
    let json:unknown={items:[],total:0};
    if(p.includes('verify-session'))json={valid:true,username:'test'};
    if(p.endsWith('/admin/summary'))json=state.summary;
    if(p.endsWith('/inspector-directory'))json=emptyDirectory;
    if(p.includes('/modules'))json={};
    if(/\/(taxi|logistics)\/admin\/(applications|rides|drivers|couriers|tasks)$/.test(p))json=[];
    if(p.endsWith('/business/me'))json={role:'owner',name:'Тестовый владелец'};
    if(p.endsWith('/business/today'))json={day:'2026-09-13',counts:{},notification_errors:0,unpaid:0,new_orders:[]};
    if(p.endsWith('/business/report'))json={start:'2026-09-13',end:'2026-09-13',sales:0,completed:0,created:0,cancelled:0,average:0,receipts:0,refunds:0,expenses_total:0,cash_difference:0,bonuses:0,promo_discounts:0,untracked_promos:0,payment_methods:{},undated_done:0,undated_paid:0,products:[],days:[],expenses:[],refunds_needed:[]};
    await r.fulfill({json});
  });
  return state;
}
test('all 31 admin sections open without rendering crashes or horizontal overflow', async ({page},info) => {
  test.setTimeout(180000);
  await setup(page);
  const failures:string[]=[];
  let current='';
  page.on('pageerror', e => failures.push(`${current}: ${e.message}`));
  for(const tab of tabs){
    current=tab;
    await page.goto(`/admin?tab=${tab}`);
    try { await expect(page.locator('main h1').filter({visible:true}).first(),tab).toBeVisible(); } catch { failures.push(`${tab}: heading missing; ${await page.locator('body').innerText()}`); continue; }
    await page.waitForLoadState('networkidle');
    if(await page.getByText('Не удалось открыть раздел.',{exact:false}).count())failures.push(`${tab}: section crashed`);
    const overflow=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,wide:Array.from(document.querySelectorAll('main *')).filter(e=>e.getBoundingClientRect().right>innerWidth+2).slice(0,6).map(e=>({tag:e.tagName,cls:e.className,text:e.textContent?.slice(0,70)}))}));
    if(overflow.scroll>overflow.width+1)failures.push(`${tab}: overflow ${JSON.stringify(overflow)}`);
    if(tab==='dashboard')await page.screenshot({path:info.outputPath('dashboard.png'),fullPage:true});
  }
  expect(failures).toEqual([]);
});
test('summary outage and stale data cannot be mistaken for an empty queue',async({page})=>{
  const s=await setup(page);s.failSummary=true;
  await page.goto('/admin');
  await expect(page.getByRole('alert')).toContainText('Не удалось обновить сводку');
  await expect(page.getByText('Нет необработанных заявок и модерации')).toHaveCount(0);
  s.failSummary=false;s.summary.total_pending=2;s.summary.food_orders_new=2;
  await page.getByRole('button',{name:'Обновить',exact:true}).click();
  await expect(page.getByRole('button',{name:/Заказы DAM ALEM/})).toBeVisible();
  s.failSummary=true;await page.getByRole('button',{name:'Обновить',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('последние загруженные данные');
  await page.getByRole('button',{name:/Заказы DAM ALEM/}).click();
  await expect(page).toHaveURL(/tab=dam-alem&section=orders/);
});
test('menu search finds a single food cabinet, mobile focus returns after Escape',async({page},info)=>{
  await setup(page);await page.goto('/admin');
  const mobile=page.viewportSize()!.width<768;
  if(mobile)await page.getByRole('button',{name:'Открыть меню'}).click();
  await page.getByRole('searchbox',{name:'Найти раздел'}).filter({visible:true}).fill('алем');
  const nav=page.getByRole('navigation',{name:'Разделы админки'}).filter({visible:true});
  await expect(nav.getByRole('button',{name:/DAM ALEM/})).toHaveCount(1);
  await page.screenshot({path:info.outputPath('menu-search.png'),animations:'disabled'});
  if(mobile){await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.getByRole('button',{name:'Открыть меню'})).toBeFocused();}
});
test('legacy food and POS links preserve their destination',async({page})=>{
  await setup(page);
  for(const [url,section] of [['tab=food-orders&order=71','orders'],['section=food-orders&order=71','orders'],['tab=pos-integration','pos'],['tab=food-settings','settings']]){
    await page.goto(`/admin?${url}`);
    await expect.poll(()=>new URL(page.url()).searchParams.get('tab')).toBe('dam-alem');
    expect(new URL(page.url()).searchParams.get('section')).toBe(section);
    if(url.includes('order=71'))expect(new URL(page.url()).searchParams.get('order')).toBe('71');
  }
  await page.goto('/admin?tab=unknown');await expect(page).toHaveURL(/tab=dashboard/);
});
test('failed visibility load cannot save defaults',async({page})=>{
  const s=await setup(page);s.failModules=true;await page.goto('/admin?tab=modules');
  await expect(page.getByRole('alert')).toContainText('Не удалось загрузить видимость');
  await expect(page.getByRole('button',{name:'Сохранить изменения'})).toHaveCount(0);
  expect(s.writes).toBe(0);
  s.failModules=false;await page.getByRole('button',{name:'Повторить загрузку'}).click();
  await expect(page.getByRole('button',{name:'Сохранить изменения'})).toBeVisible();
});

test('session verification outage keeps the saved session and offers retry',async({page})=>{
  await setup(page);let failed=true;
  await page.route('**/admin-auth/verify-session',r=>failed?r.fulfill({status:503,json:{detail:'Unavailable'}}):r.fallback());
  await page.goto('/admin');await expect(page.getByRole('alert')).toContainText('Не удалось проверить вход');
  expect(await page.evaluate(()=>localStorage.getItem('_sp924_token'))).toBe('test-admin');
  failed=false;await page.getByRole('button',{name:'Повторить проверку'}).click();
  await expect(page.getByRole('heading',{name:'Требует внимания'})).toBeVisible();
});
test('broken section leaves navigation available',async({page})=>{
  await setup(page);await page.route('**/business/today',r=>r.fulfill({json:{counts:null}}));
  await page.goto('/admin?tab=dam-alem');await expect(page.getByRole('alert')).toContainText('Не удалось открыть раздел');
  if(page.viewportSize()!.width<768)await page.getByRole('button',{name:'Открыть меню'}).click();
  await page.getByRole('navigation',{name:'Разделы админки'}).filter({visible:true}).getByRole('button',{name:'Центр управления',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Требует внимания'})).toBeVisible();
});
test('content editors fit the viewport and can be cancelled without writes',async({page})=>{
  const s=await setup(page);
  for(const [tab,button] of [['news','Добавить'],['announcements','Добавить'],['real-estate','Добавить'],['jobs','Добавить'],['banners','Добавить баннер'],['salons','Добавить салон']]){
    await page.goto(`/admin?tab=${tab}`);await page.getByRole('button',{name:button,exact:true}).click();
    const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();
    const box=await dialog.boundingBox();expect(box!.x,tab).toBeGreaterThanOrEqual(0);expect(box!.x+box!.width,tab).toBeLessThanOrEqual(page.viewportSize()!.width+1);
    expect(await dialog.evaluate(e=>e.scrollWidth<=e.clientWidth+1),`${tab}: dialog content overflow`).toBe(true);
    await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
  }
  expect(s.writes).toBe(0);
});
