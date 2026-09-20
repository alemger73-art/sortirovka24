import {test,expect,type Page} from '@playwright/test';
import {reportCsv} from '../src/lib/foodBusinessExport';
async function setup(page:Page,role='owner'){
 const data={start:'2026-09-13',end:'2026-09-13',sales:5000,completed:2,created:3,cancelled:1,average:2500,receipts:6000,refunds:500,expenses_total:1000,cash_difference:4500,bonuses:100,promo_discounts:200,untracked_promos:0,payment_methods:{cash:4000,kaspi_qr:2000},undated_done:0,undated_paid:0,products:[{name:'Тестовый донер',quantity:2,amount:5000}],days:[{day:'2026-09-13',sales:5000}],expenses:[] as {id:string;day:string;amount:number;category:string;note:string;voided:boolean;void_reason:string}[],refunds_needed:[]};
 const state={role,data,writes:0,available:true,staff:[{id:1,name:'Владелец',email:'owner@example.test',phone:'',active:true,role:'owner'}],lastBody:{} as Record<string,unknown>};
 await page.addInitScript(()=>{localStorage.setItem('app_lang','kz');localStorage.setItem('sortirovka-theme','dark');localStorage.setItem('_partner_token_dam_alem','test-partner');localStorage.setItem('_dam_alem_partner_token','test-partner');localStorage.setItem('token','test-partner');});
 await page.route('**/*',r=>['127.0.0.1','localhost'].includes(new URL(r.request().url()).hostname)?r.continue():r.abort());
 await page.route('**/api/**',async r=>{const url=new URL(r.request().url()),path=url.pathname,method=r.request().method();let json:unknown={items:[],total:0};
 if(path.includes('verify-session'))json={valid:true,display_name:'Тестовый сотрудник',login:'test'};
 if(path.endsWith('/business/me'))json={role:state.role,name:'Тест'};
 if(path.endsWith('/business/today'))json={day:'2026-09-13',counts:{new:2,preparing:1,ready:1},notification_errors:1,unpaid:2,new_orders:[{id:71,name:'Тестовый клиент',amount:2000,delivery_method:'pickup'}]};
 if(path.endsWith('/business/report'))json=state.data;
 if(path.endsWith('/business/expenses')){state.writes++;state.lastBody=r.request().postDataJSON();state.data.expenses.push({...state.lastBody,amount:Number(state.lastBody.amount),voided:false,void_reason:''} as typeof data.expenses[number]);json={id:state.lastBody.id};}
 if(path.endsWith('/business/staff')){if(method==='POST'){state.writes++;const b=r.request().postDataJSON();state.staff.push({id:2,name:b.name,email:b.email,phone:'',active:true,role:'operator'});json={id:2};}else json=state.staff;}
 if(path.endsWith('/business/availability'))json=[{id:1,name:'Тестовый донер',available:state.available}];
 if(path.endsWith('/business/availability/1')){state.available=r.request().postDataJSON().available;state.writes++;json={ok:true};}
 await r.fulfill({json});});return state;
}
test('partner orders, finance and Telegram are localized and fit dark mode',async({page},info)=>{
 await setup(page);const errors:string[]=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.text().includes('[i18n] Missing'))errors.push(m.text());});
 for(const section of ['today','sales','orders','staff','telegram','brand','menu','banners','settings']){
  await page.goto('/partner/dam-alem?section='+section);
  await expect(page.getByRole('navigation',{name:'Кабинет бөлімдері'})).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang','kk');
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.waitForTimeout(250);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),section).toBe(true);
  await expect(page.locator('main')).not.toContainText(/Продажи и расходы|Сохранить настройки|Токен бота|Записать расход|Создать оператора|Нет заказов|Скачать CSV/);
  if(['today','sales','telegram'].includes(section))await page.screenshot({path:info.outputPath('partner-'+section+'-kk-dark.png'),animations:'disabled'});
 }
 expect(errors).toEqual([]);
});
