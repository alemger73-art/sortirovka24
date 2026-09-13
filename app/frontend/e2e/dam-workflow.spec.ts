import {test,expect,type Page} from '@playwright/test';

async function setup(page:Page) {
 const order={id:71,version:0,status:'preparing',customer_name:'Клиент',customer_phone:'+77000000000',delivery_method:'delivery',delivery_address:'Тестовая 1',order_items:JSON.stringify([{id:1,name:'Пицца',quantity:1,price:1000,sum:1000}]),total_amount:1200,paid_amount:1200,payment_method:'cash',payment_status:'paid',comment:'',created_at:'2026-09-13T10:00:00Z',operator_note:'',cancellation_reason:'',receipt_revision:0};
 const state={order,writes:0,changes:[] as any[],status:'preparing'};
 await page.addInitScript(()=>{localStorage.setItem('app_lang','ru');localStorage.setItem('sortirovka-theme','dark');localStorage.setItem('_partner_token_dam_alem','test');localStorage.setItem('_dam_alem_partner_token','test');localStorage.setItem('account_token','test');localStorage.setItem('account_user_profile',JSON.stringify({id:'client',name:'Клиент',phone:'+77000000000',role:'user'}));sessionStorage.setItem('s24_welcome_done','1');});
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.route('**/api/**',async r=>{
  const path=new URL(r.request().url()).pathname; let json:any={items:[],total:0};
  if(path.includes('verify-session'))json={valid:true,display_name:'Оператор'};
  if(path.endsWith('/business/me'))json={role:'operator',name:'Оператор'};
  if(path.endsWith('/operations/catalog'))json={products:[{id:2,name:'Напиток',price:300}],groups:[],options:[],links:[]};
  if(path.endsWith('/operations/orders'))json={items:[order],total:1};
  if(path.endsWith('/operations/orders/71'))json={order,events:[]};
  if(path.endsWith('/receipt/quote'))json={items:[{name:'Пицца',quantity:1,sum:1000},{name:'Напиток',quantity:1,sum:300}],total_amount:1500,previous_total:1200,paid_amount:1200,amount_due:300,refund_due:0};
  if(path.endsWith('/receipt')) {state.writes++;const payload=r.request().postDataJSON();expect(payload.expected_version).toBe(0);expect(payload.quoted_total).toBe(1500);order.total_amount=1500;order.version++;order.receipt_revision++;order.payment_status='pending';json=order;}
  if(path.endsWith('/manual/quote'))json={items:[{name:'Напиток',quantity:1,sum:300}],total_amount:300};
  if(path.endsWith('/manual')){state.writes++;expect(r.request().postDataJSON().request_key).toBeTruthy();json={...order,id:72};}
  if(path.endsWith('/account/me'))json={id:'client',name:'Клиент',phone:'+77000000000',role:'user'};
  if(path.endsWith('/account/orders/food/71'))json={...order,type:'food',order_number:71,amount:order.total_amount,status:state.status,receipt_changes:state.changes};
  await r.fulfill({json});
 });
 return state;
}

test('operator adds a dish only after quote and customer reason',async({page},info)=>{
 const s=await setup(page);await page.goto('/partner/dam-alem?section=orders&order=71');
 await page.getByRole('button',{name:'Изменить состав заказа',exact:true}).click();
 const modal=page.getByRole('dialog');await modal.getByRole('button',{name:/Напиток/}).click();
 await expect(modal.getByRole('button',{name:'Рассчитать и проверить'})).toBeDisabled();
 await modal.getByLabel('Причина изменения — увидит клиент').fill('Клиент позвонил и добавил напиток');
 await modal.getByRole('button',{name:'Рассчитать и проверить'}).click();
 await expect(modal.getByText('К оплате: 300 ₸',{exact:true})).toBeVisible();
 expect(s.writes).toBe(0);
 expect(await modal.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
 await page.screenshot({path:info.outputPath('receipt-editor.png')});
 await modal.getByRole('button',{name:'Подтвердить и сохранить'}).click();
 await expect(modal).toHaveCount(0);expect(s.writes).toBe(1);
});

test('operator can create a phone order with server quote',async({page})=>{
 const s=await setup(page);await page.goto('/partner/dam-alem?section=orders');await page.getByRole('button',{name:'Новый заказ',exact:true}).click();
 const modal=page.getByRole('dialog');await modal.getByLabel('Имя клиента').fill('Клиент');await modal.getByLabel('Телефон клиента').fill('+77000000000');await modal.getByLabel('Получение').selectOption('pickup');await modal.getByRole('button',{name:/Напиток/}).click();
 await modal.getByRole('button',{name:'Рассчитать и проверить'}).click();await expect(modal.getByText('Итого: 300 ₸',{exact:true})).toBeVisible();
 await modal.getByRole('button',{name:'Подтвердить и сохранить'}).click();await expect(modal).toHaveCount(0);expect(s.writes).toBe(1);
});

test('customer sees refreshed receipt and status instead of map',async({page},info)=>{
 const s=await setup(page);await page.goto('/delivery/food/71');await expect(page).toHaveURL(/cabinet\/orders\/food\/71/);
 await expect(page.locator('[aria-current="step"]')).toHaveText('Готовится');
 s.status='ready';s.order.receipt_revision=1;s.order.total_amount=1500;s.changes=[{revision:1,reason:'Клиент добавил напиток',created_at:'2026-09-13T10:10:00Z',before:{total_amount:1200,items:[{name:'Пицца',quantity:1}]},after:{total_amount:1500,items:[{name:'Пицца',quantity:1},{name:'Напиток',quantity:1}]}}];
 await expect(page.locator('[aria-current="step"]')).toHaveText('Готов',{timeout:10000});
 await page.getByText('История изменений состава',{exact:true}).click();await expect(page.getByText('Напиток × 1',{exact:true})).toBeVisible();
 await expect(page.locator('.leaflet-container, .maplibregl-map')).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.screenshot({path:info.outputPath('customer-receipt.png')});
});

test('onsite order needs no phone and receipt printing escapes customer text',async({page})=>{
 const s=await setup(page);await page.goto('/partner/dam-alem?section=orders&order=71');
 await page.getByRole('button',{name:'Новый заказ',exact:true}).click();const modal=page.getByRole('dialog');
 await modal.getByLabel('Получение').selectOption('dine_in');await modal.getByRole('button',{name:/Напиток/}).click();
 await modal.getByRole('button',{name:'Рассчитать и проверить'}).click();await modal.getByRole('button',{name:'Подтвердить и сохранить'}).click();
 await expect(modal).toHaveCount(0);expect(s.writes).toBe(1);
});

test('owner configures daily payroll and records payment',async({page})=>{
 await setup(page);
 const employee={id:1,name:'Повар',position:'Повар',daily_base:5000,percent:10,basis:'kitchen',active:true};
 const report:any={day:'2026-09-14',version:0,fingerprint:'test',closed:false,rows:[],sales:{kitchen:10000,bar:2000,unassigned:0},total:0,pending_orders:0,unassigned:0,new_sales_after_close:0,payments:[]};
 await page.route('**/api/v1/dam-alem/business/me',r=>r.fulfill({json:{role:'owner',name:'Владелец'}}));
 await page.route('**/api/v1/dam-alem/payroll/**',async r=>{
  const path=new URL(r.request().url()).pathname;let json:any=report;
  if(path.endsWith('/employees'))json=[employee];
  else if(path.endsWith('/departments'))json=[];
  else if(path.includes('/work/')){report.rows=[{...employee,employee_id:1,sales:10000,commission:1000,total:6000,paid:0,remaining:6000}];report.total=6000;report.version++;}
  else if(path.endsWith('/close')){expect(r.request().postDataJSON().fingerprint).toBe('test');report.closed=true;report.version++;}
  else if(path.endsWith('/payments')){const p=r.request().postDataJSON();expect(p.amount).toBe(6000);expect(p.id).toBeTruthy();report.rows[0].paid=6000;report.rows[0].remaining=0;report.payments=[{...p,created_at:new Date().toISOString()}];report.version++;}
  await r.fulfill({json});
 });
 await page.goto('/partner/dam-alem?section=payroll');
 await page.getByRole('button',{name:'Отметить выход: Повар',exact:true}).click();
 await expect(page.getByText('Начислено: 6000 ₸',{exact:true}).first()).toBeVisible();
 await page.getByRole('button',{name:'Подтвердить и закрыть день',exact:true}).click();
 await page.getByRole('button',{name:'Отметить выплату',exact:true}).click();
 await expect(page.getByText('Осталось выплатить: 0 ₸',{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});

