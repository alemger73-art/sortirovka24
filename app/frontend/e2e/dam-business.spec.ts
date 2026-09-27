import {test,expect,type Page} from '@playwright/test';
import {reportCsv} from '../src/lib/foodBusinessExport';
async function setup(page:Page,role='owner'){
 const data={start:'2026-09-13',end:'2026-09-13',sales:5000,completed:2,created:3,cancelled:1,average:2500,receipts:6000,refunds:500,expenses_total:1000,cash_difference:4500,bonuses:100,promo_discounts:200,untracked_promos:0,payment_methods:{cash:4000,kaspi_qr:2000},undated_done:0,undated_paid:0,products:[{name:'Тестовый донер',quantity:2,amount:5000}],days:[{day:'2026-09-13',sales:5000}],expenses:[] as {id:string;day:string;amount:number;category:string;note:string;voided:boolean;void_reason:string}[],refunds_needed:[]};
 const summary={day:'2026-09-13',daily:{created:3},counts:{new:2,preparing:1,ready:1},notification_errors:1,unpaid:2,new_orders:[]};
 const overview={team:[],attention:[],attention_total:0,recent_orders:[] as any[]};
 const state={role,data,summary,overview,writes:0,available:true,staff:[{id:1,name:'Владелец',email:'owner@example.test',phone:'',active:true,role:'owner'}],lastBody:{} as Record<string,unknown>};
 await page.addInitScript(()=>{localStorage.setItem('_partner_token_dam_alem','test-partner');localStorage.setItem('_dam_alem_partner_token','test-partner');localStorage.setItem('token','test-partner');});
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.route('**/api/**',async r=>{const url=new URL(r.request().url()),path=url.pathname,method=r.request().method();let json:unknown={items:[],total:0};
 if(path.includes('verify-session'))json={valid:true,display_name:'Тестовый сотрудник',login:'test'};
 if(path.endsWith('/shifts/me'))json={staff:{id:1,name:'Оператор',role:'operator',pin_set:true},shift:{id:1,staff_name:'Оператор',role:'operator',opened_at:'2026-09-27T07:00:00Z',active:true}};
 if(path.endsWith('/business/me'))json={role:state.role,name:'Тест'};
 if(path.endsWith('/business/today'))json=state.summary;
 if(path.endsWith('/business/staff/couriers'))json=[];
 if(path.endsWith('/business/overview'))json=state.overview;
 if(path.endsWith('/business/report'))json=state.data;
 if(path.endsWith('/business/expenses')){state.writes++;state.lastBody=r.request().postDataJSON();state.data.expenses.push({...state.lastBody,amount:Number(state.lastBody.amount),voided:false,void_reason:''} as typeof data.expenses[number]);json={id:state.lastBody.id};}
 if(path.endsWith('/business/staff')){if(method==='POST'){state.writes++;const b=r.request().postDataJSON();state.staff.push({id:2,name:b.name,email:b.email,phone:'',active:true,role:'operator'});json={id:2};}else json=state.staff;}
 if(path.endsWith('/business/availability'))json=[{id:1,name:'Тестовый донер',available:state.available}];
 if(path.endsWith('/business/availability/1')){state.available=r.request().postDataJSON().available;state.writes++;json={ok:true};}
 await r.fulfill({json});});return state;
}
test('owner dashboard and report are clear on all screens',async({page},info)=>{await setup(page);await page.goto('/partner/dam-alem');await expect(page.getByRole('heading',{name:/^Сегодня,/})).toBeVisible();await expect(page.getByText('Выручка сегодня',{exact:true})).toBeVisible();await page.getByRole('navigation',{name:'Разделы кабинета'}).getByRole('button',{name:'Финансы',exact:true}).click();await expect(page.getByText('Популярные блюда',{exact:true})).toBeVisible();await expect(page.getByText(/Денежная разница за период, не чистая прибыль/)).toBeVisible();await expect(page.getByText('Тестовый донер · 2 шт.',{exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:info.outputPath('finance.png'),fullPage:true});});
test('owner records expense and adds operator through team',async({page})=>{const state=await setup(page);await page.goto('/partner/dam-alem?section=sales');await page.getByLabel('Сумма расхода',{exact:true}).fill('250.50');await page.getByLabel('Назначение расхода',{exact:true}).fill('Тестовая упаковка');await page.getByRole('button',{name:'Записать расход',exact:true}).click();await expect(page.getByText('Тестовая упаковка',{exact:true})).toBeVisible();expect(state.writes).toBe(1);expect(state.lastBody.amount).toBe('250.5');await page.getByRole('navigation',{name:'Разделы кабинета'}).getByRole('button',{name:'Команда',exact:true}).click();await page.getByLabel('Имя сотрудника',{exact:true}).fill('Тестовый оператор');await page.getByLabel('Логин для входа',{exact:true}).fill('operator@example.test');await page.getByLabel('Пароль (минимум 10 символов)',{exact:true}).fill('StrongTestPassword42');await page.getByLabel('Повторите пароль',{exact:true}).fill('StrongTestPassword42');await page.locator('fieldset').filter({has:page.getByRole('heading',{name:'Добавить сотрудника',exact:true})}).getByLabel('PIN из 4 цифр',{exact:true}).fill('8274');await page.getByRole('button',{name:'Создать личный доступ',exact:true}).click();await expect(page.getByLabel('Пароль (минимум 10 символов)',{exact:true})).toHaveValue('');await expect(page.getByText('Тестовый оператор',{exact:true})).toBeVisible();expect(state.writes).toBe(2);});
test('operator cannot open finance and can mark dishes unavailable',async({page},info)=>{const state=await setup(page,'operator');await page.goto('/partner/dam-alem?section=sales');await expect(page.getByRole('heading',{name:'Сегодня',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Финансы',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Настройки',exact:true})).toHaveCount(0);await expect(page.getByText('Выручка сегодня',{exact:true})).toHaveCount(0);await page.getByRole('button',{name:/Готовятся/}).click();await expect(page).toHaveURL(/status=preparing/);await page.getByRole('button',{name:'Стоп-лист',exact:true}).click();await page.getByRole('button',{name:'В стоп',exact:true}).click();await expect(page.getByRole('button',{name:'Вернуть',exact:true})).toBeVisible();expect(state.available).toBe(false);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:info.outputPath('operator.png'),fullPage:true});});

test('CSV escapes formulas and exports numeric amounts',()=>{
 const csv=reportCsv([['Название','Сумма'],['=HYPERLINK("test")',-250.5],['+cmd',100]]);
 expect(csv).toContain("'=HYPERLINK");expect(csv).toContain('-250,5');expect(csv).toContain("'+cmd");
});
test('owner downloads the selected report',async({page})=>{
 await setup(page);await page.goto('/partner/dam-alem?section=sales');
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Скачать CSV',exact:true}).click();
 expect((await download).suggestedFilename()).toBe('DAM-ALEM-2026-09-13-2026-09-13.csv');
});

test('owner courier details show custody and record a real payout intent',async({page},info)=>{
 await setup(page);
 const money={collected:1200,handed_over:0,cash_balance:1200,earned:800,earned_total:800,paid_total:0,payout_due:800,deliveries:1,pending_handover:null,events:[]};
 let writes=0;
 await page.route('**/business/staff/couriers',r=>r.fulfill({json:[{id:'test-courier',name:'Тестовый курьер',phone:'+77000000000',active:true,pin_set:true}]}));
 await page.route('**/business/couriers/test-courier/details',r=>r.fulfill({json:{money,legacy_balance:0,legacy_note:'Старый баланс сохранён отдельно.',shifts:[{id:1,opened_at:'2026-09-28T06:00:00Z',closed_at:null}],deliveries:[],handovers:[]}}));
 await page.route('**/business/couriers/test-courier/payouts',r=>{const body=r.request().postDataJSON();expect(body.amount).toBe('800');expect(body.comment).toBe('Выплата за смену');expect(body.request_key).toMatch(/^[a-f\d-]{36}$/);writes++;money.paid_total=800;money.payout_due=0;return r.fulfill({json:{id:1,amount:800}});});
 await page.goto('/partner/dam-alem');await page.getByRole('navigation',{name:'Разделы кабинета'}).getByRole('button',{name:'Команда',exact:true}).click();
 await page.getByRole('button',{name:'Работа и деньги',exact:true}).click();await expect(page.getByText('Наличные у курьера',{exact:true})).toBeVisible();
 await page.getByText('Отметить выплату курьеру',{exact:true}).click();await page.getByLabel('Сумма',{exact:true}).fill('800');await page.getByLabel('Комментарий',{exact:true}).fill('Выплата за смену');
 page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Отметить выплаченным'}).click();
 await expect.poll(()=>writes).toBe(1);await expect(page.getByLabel('Сумма',{exact:true})).toHaveValue('');
 expect(money.cash_balance).toBe(1200);expect(money.payout_due).toBe(0);
 const overflow=await page.locator('body *').evaluateAll(els=>els.filter(e=>{const b=e.getBoundingClientRect();return b.width>0&&b.right>innerWidth+1;}).map(e=>({tag:e.tagName,cls:e.className,text:e.textContent?.slice(0,90)})));expect(overflow).toEqual([]);
 await page.screenshot({path:info.outputPath('owner-courier-money.png'),fullPage:true});
});

test('operator confirms cash custody and resolves a courier problem',async({page})=>{
 await setup(page,'operator');
 const work={handovers:[{id:1,name:'Тестовый курьер',amount:1200}],issues:[{id:1,order_id:7,name:'Тестовый курьер',reason:'no_answer',comment:'Жду у подъезда'}]};
 await page.route('**/operations/courier-work',r=>r.fulfill({json:work}));
 await page.route('**/operations/cash-handovers/1/confirm',r=>{work.handovers=[];return r.fulfill({json:{id:1,status:'confirmed'}});});
 await page.route('**/operations/delivery-issues/1/resolve',r=>{expect(r.request().postDataJSON().resolution).toBe('Позвонил клиенту, повторить доставку');work.issues=[];return r.fulfill({json:{ok:true}});});
 await page.goto('/partner/dam-alem?section=deliveries');
 await expect(page.getByText('Клиент не отвечает · Жду у подъезда',{exact:true})).toBeVisible();
 page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Подтвердить получение',exact:true}).click();await expect(page.getByRole('button',{name:'Подтвердить получение',exact:true})).toHaveCount(0);
 page.once('dialog',d=>d.accept('Позвонил клиенту, повторить доставку'));await page.getByRole('button',{name:'Отметить решённой'}).click();await expect(page.getByText('Курьеры: требует внимания',{exact:true})).toHaveCount(0);
});


test('operator delivery board shows courier and opens the matching order', async ({page}, info) => {
 await setup(page, 'operator');
 await page.route('**/operations/deliveries', r => r.fulfill({json:{items:[{order_id:71,status:'ready',delivery_status:'assigned',address:'Длинный адрес доставки, дом 12, квартира 40',customer_name:'Клиент',amount_due:1800,courier_name:'Курьер Арман',courier_phone:'+77001111111'}]}}));
 await page.goto('/partner/dam-alem?section=deliveries');
 await expect(page.getByText('Курьер Арман',{exact:true})).toBeVisible();
 await expect(page.getByRole('link',{name:'+77001111111'})).toHaveAttribute('href','tel:+77001111111');
 await expect(page.getByText(/1\s*800/)).toBeVisible(); // Operator board shows the amount due; courier entry is a separate PIN screen.
 expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);
 await page.screenshot({path:info.outputPath('deliveries.png'),fullPage:true});
 await page.getByRole('button',{name:'Открыть заказ',exact:true}).click();
 await expect(page).toHaveURL(/order=71/);
});


test('courier keeps a profile draft when the cabinet refreshes', async ({page}) => {
 await page.addInitScript(()=>{localStorage.setItem('app_lang','ru');localStorage.setItem('s24_dam_courier_token','test');localStorage.setItem('account_user_profile',JSON.stringify({id:'courier',name:'Курьер',role:'user'}));sessionStorage.setItem('s24_welcome_done','1');});
 let reads=0;
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.route('**/api/**', async r=>{
  const path=new URL(r.request().url()).pathname;let json:unknown={items:[],total:0};
  if(path.endsWith('/modules'))json={food:true};
  if(path.endsWith('/account/me'))json={id:'courier',name:'Курьер',role:'user'};
  if(path.endsWith('/courier/access'))json={can_access_cabinet:true,is_courier:true,status:'approved'};
  if(path.endsWith('/courier/cabinet')) {reads++;json={profile:{verified:true,online:true,phone:'+77001111111',vehicle_type:'bike',rating:5,deliveries_count:0},offered_task:null,active_task:null,available_tasks:[],task_history:[],earnings:0,status_flow:{}};}
  await r.fulfill({json});
 });
 await page.goto('/cabinet/courier');await expect(page).toHaveURL(/food\/courier/);
 await page.getByRole('navigation',{name:'Кабинет курьера'}).getByRole('button',{name:'Профиль',exact:true}).click();
 const phone=page.getByLabel('Телефон',{exact:true});
 await expect(phone).toHaveValue('+77001111111');
 await phone.fill('+77002222222');
 const before=reads;
 await expect.poll(()=>reads,{timeout:10000}).toBeGreaterThan(before);
 await expect(phone).toHaveValue('+77002222222');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});


test('owner polling refreshes operator statuses and payment projections',async({page})=>{
 const state=await setup(page);await page.clock.install();
 state.summary.counts={new:1,preparing:0,ready:0};
 state.overview.recent_orders=[{id:901,name:'Polling client',status:'new',amount:600,source:'operator',delivery_method:'delivery'}];
 await page.goto('/partner/dam-alem');
 const recent=page.locator('section').filter({has:page.getByRole('heading',{name:'Последние заказы',exact:true})});
 await expect(recent).toContainText('Оператор · Новые');
 for(const [status,label] of [['confirmed','Приняты'],['preparing','Готовятся'],['ready','Готовы к выдаче'],['in_progress','В доставке'],['done','Завершён'],['cancelled','Отменён']]){
   state.overview.recent_orders[0].status=status;
   state.summary.counts={[status]:1} as typeof state.summary.counts;
   await page.clock.fastForward(15001);
   await expect(recent).toContainText(`Оператор · ${label}`);
   if(!['done','cancelled'].includes(status)){
     const live=page.locator('section').filter({has:page.getByRole('heading',{name:'Заказы сейчас',exact:true})});
     await expect(live.getByRole('button',{name:new RegExp(label+' 1$')})).toBeVisible();
   }
 }
 state.data.receipts=600;state.data.sales=0;state.data.refunds=0;state.data.cash_difference=600;
 await page.clock.fastForward(15001);
 const receipts=page.locator('section').filter({has:page.getByText('Получено денег',{exact:true})});
 await expect(receipts).toContainText('600 ₸');
 await expect(page.getByLabel('PIN из 4 цифр')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Открыть смену',exact:true})).toHaveCount(0);
});
