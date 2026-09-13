import { test, expect, type Page } from '@playwright/test';
import { emptyDirectory } from '../src/lib/inspectorDirectory';
const tabs = ['dashboard','news','banners','complaints','history','announcements','real-estate','jobs','masters','salons','master-requests','become-master','dam-alem','park-points','park-orders','directory','inspectors','taxi','logistics','transport','partners-business','partners-gastronom','partners-volna','partners-prorab','partners-pharmacy','modules','stats','categories','support','push','account-settings'];
const counters = { master_requests_new:0, become_master_pending:0, announcements_pending:0, complaints_new:0, real_estate_pending:0, jobs_pending:0, food_orders_new:0, park_orders_active:0, taxi_applications_pending:0, courier_applications_pending:0, business_partner_new:0 };
async function setup(page: Page) {
  const state = { failSummary:false, failModules:false, writes:0, summary:{...counters,total_pending:0,updated_at:'2026-09-13T10:00:00Z',recent:[]} };
  await page.addInitScript(() => {localStorage.setItem('_sp924_token','test-admin');localStorage.setItem('token','test-admin');localStorage.setItem('app_lang','kz');localStorage.setItem('sortirovka-theme','dark');});
  await page.route('**/*', r => ['127.0.0.1', 'localhost'].includes(new URL(r.request().url()).hostname) ? r.continue() : r.abort());
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
test('all 31 admin sections support Kazakh and dark mode', async ({page},info) => {
  test.setTimeout(180000);
  await setup(page);
  const failures:string[]=[];
  let current='';
  page.on('console', m => { if(m.text().includes('[i18n] Missing')) failures.push(current+': '+m.text()); });
  page.on('pageerror', e => failures.push(`${current}: ${e.message}`));
  for(const tab of tabs){
    current=tab;
    await page.goto(`/admin?tab=${tab}`);
    try { await expect(page.locator('main h1').filter({visible:true}).first(),tab).toBeVisible(); } catch { failures.push(`${tab}: heading missing; ${await page.locator('body').innerText()}`); continue; }
    await page.waitForLoadState('networkidle');
    await expect(page.locator('html')).toHaveClass(/dark/);
    await expect(page.locator('html')).toHaveAttribute('lang','kk');
    if(await page.getByText('Не удалось открыть раздел.',{exact:false}).count())failures.push(`${tab}: section crashed`);
    const overflow=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,wide:Array.from(document.querySelectorAll('main *')).filter(e=>e.getBoundingClientRect().right>innerWidth+2).slice(0,6).map(e=>({tag:e.tagName,cls:e.className,text:e.textContent?.slice(0,70)}))}));
    if(overflow.scroll>overflow.width+1)failures.push(`${tab}: overflow ${JSON.stringify(overflow)}`);
    if(tab==='dashboard')await page.screenshot({path:info.outputPath('dashboard.png'),fullPage:true});
  }
  expect(failures).toEqual([]);
});
