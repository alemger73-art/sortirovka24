import {test,expect,type Page} from '@playwright/test';
import {reportCsv} from '../src/lib/foodBusinessExport';
async function setup(page:Page,role='owner'){
 const data={start:'2026-09-13',end:'2026-09-13',sales:5000,completed:2,created:3,cancelled:1,average:2500,receipts:6000,refunds:500,expenses_total:1000,cash_difference:4500,bonuses:100,promo_discounts:200,untracked_promos:0,payment_methods:{cash:4000,kaspi_qr:2000},undated_done:0,undated_paid:0,products:[{name:'Тестовый донер',quantity:2,amount:5000}],days:[{day:'2026-09-13',sales:5000}],expenses:[] as {id:string;day:string;amount:number;category:string;note:string;voided:boolean;void_reason:string}[],refunds_needed:[]};
 const state={role,data,writes:0,available:true,staff:[{id:1,name:'Владелец',email:'owner@example.test',phone:'',active:true,role:'owner'}],lastBody:{} as Record<string,unknown>};
 await page.addInitScript(()=>{localStorage.setItem('_partner_token_dam_alem','test-partner');localStorage.setItem('_dam_alem_partner_token','test-partner');localStorage.setItem('token','test-partner');});
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
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
test('owner dashboard and report are clear on all screens',async({page},info)=>{await setup(page);await page.goto('/partner/dam-alem');await expect(page.getByRole('heading',{name:'Сегодня',exact:true})).toBeVisible();await expect(page.getByText('Завершённые продажи сегодня',{exact:true})).toBeVisible();await page.getByRole('navigation',{name:'Разделы кабинета'}).getByRole('button',{name:'Продажи и расходы',exact:true}).click();await expect(page.getByText('Популярные блюда',{exact:true})).toBeVisible();await expect(page.getByText(/Денежная разница за период, не чистая прибыль/)).toBeVisible();await expect(page.getByText('Тестовый донер · 2 шт.',{exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:info.outputPath('finance.png'),fullPage:true});});
test('owner records expense and adds operator through settings',async({page})=>{const state=await setup(page);await page.goto('/partner/dam-alem?section=sales');await page.getByLabel('Сумма расхода',{exact:true}).fill('250.50');await page.getByLabel('Назначение расхода',{exact:true}).fill('Тестовая упаковка');await page.getByRole('button',{name:'Записать расход',exact:true}).click();await expect(page.getByText('Тестовая упаковка',{exact:true})).toBeVisible();expect(state.writes).toBe(1);expect(state.lastBody.amount).toBe('250.5');await page.getByRole('navigation',{name:'Разделы кабинета'}).getByRole('button',{name:'Настройки',exact:true}).click();await page.getByRole('button',{name:'Сотрудники',exact:true}).click();await page.getByLabel('Имя оператора',{exact:true}).fill('Тестовый оператор');await page.getByLabel('Email оператора',{exact:true}).fill('operator@example.test');await page.getByLabel('Пароль оператора',{exact:true}).fill('StrongTestPassword42');await page.getByRole('button',{name:'Создать оператора',exact:true}).click();await expect(page.getByLabel('Пароль оператора',{exact:true})).toHaveValue('');await expect(page.getByText('Тестовый оператор',{exact:true})).toBeVisible();expect(state.writes).toBe(2);});
test('operator cannot open finance and can mark dishes unavailable',async({page},info)=>{const state=await setup(page,'operator');await page.goto('/partner/dam-alem?section=sales');await expect(page.getByRole('heading',{name:'Сегодня',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Продажи и расходы',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Настройки',exact:true})).toHaveCount(0);await expect(page.getByText('Завершённые продажи сегодня',{exact:true})).toHaveCount(0);await page.getByRole('button',{name:/Готовятся/}).click();await expect(page).toHaveURL(/status=preparing/);await page.getByRole('button',{name:'Доступность блюд',exact:true}).click();await page.getByRole('button',{name:'Есть · отметить закончилось',exact:true}).click();await expect(page.getByRole('button',{name:'Закончилось · вернуть в меню',exact:true})).toBeVisible();expect(state.available).toBe(false);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:info.outputPath('operator.png'),fullPage:true});});

test('CSV escapes formulas and exports numeric amounts',()=>{
 const csv=reportCsv([['Название','Сумма'],['=HYPERLINK("test")',-250.5],['+cmd',100]]);
 expect(csv).toContain("'=HYPERLINK");expect(csv).toContain('-250,5');expect(csv).toContain("'+cmd");
});
test('owner downloads the selected report',async({page})=>{
 await setup(page);await page.goto('/partner/dam-alem?section=sales');
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Скачать CSV',exact:true}).click();
 expect((await download).suggestedFilename()).toBe('DAM-ALEM-2026-09-13-2026-09-13.csv');
});


test('operator delivery board shows courier and opens the matching order', async ({page}, info) => {
 await setup(page, 'operator');
 await page.route('**/operations/deliveries', r => r.fulfill({json:{items:[{order_id:71,status:'ready',delivery_status:'assigned',address:'Длинный адрес доставки, дом 12, квартира 40',customer_name:'Клиент',amount_due:1800,courier_name:'Курьер Арман',courier_phone:'+77001111111'}]}}));
 await page.goto('/partner/dam-alem?section=deliveries');
 await expect(page.getByText('Курьер Арман',{exact:true})).toBeVisible();
 await expect(page.getByRole('link',{name:'+77001111111'})).toHaveAttribute('href','tel:+77001111111');
 await expect(page.getByRole('link',{name:'Кабинет курьера',exact:true})).toHaveAttribute('href','/cabinet/courier');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);
 await page.screenshot({path:info.outputPath('deliveries.png'),fullPage:true});
 await page.getByRole('button',{name:'Открыть заказ',exact:true}).click();
 await expect(page).toHaveURL(/order=71/);
});


test('courier keeps a profile draft when the cabinet refreshes', async ({page}) => {
 await page.addInitScript(()=>{localStorage.setItem('app_lang','ru');localStorage.setItem('account_token','test');localStorage.setItem('account_user_profile',JSON.stringify({id:'courier',name:'Курьер',role:'user'}));sessionStorage.setItem('s24_welcome_done','1');});
 let reads=0;
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.route('**/api/**', async r=>{
  const path=new URL(r.request().url()).pathname;let json:unknown={items:[],total:0};
  if(path.endsWith('/account/me'))json={id:'courier',name:'Курьер',role:'user'};
  if(path.endsWith('/courier/access'))json={can_access_cabinet:true,is_courier:true,status:'approved'};
  if(path.endsWith('/courier/cabinet')) {reads++;json={profile:{verified:true,online:true,phone:'+77001111111',vehicle_type:'bike',rating:5,deliveries_count:0},offered_task:null,active_task:null,available_tasks:[],task_history:[],earnings:0,status_flow:{}};}
  await r.fulfill({json});
 });
 await page.goto('/cabinet/courier');
 const phone=page.getByRole('textbox').last();
 await expect(phone).toHaveValue('+77001111111');
 await phone.fill('+77002222222');
 const before=reads;
 await expect.poll(()=>reads,{timeout:10000}).toBeGreaterThan(before);
 await expect(phone).toHaveValue('+77002222222');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
