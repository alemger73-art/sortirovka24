import {test,expect,type Page} from '@playwright/test';

async function setup(page:Page) {
 const order:any={id:71,version:0,status:'new',order_source:'operator',customer_name:'Клиент',customer_phone:'+77000000000',delivery_method:'pickup',delivery_address:'',order_items:JSON.stringify([{id:2,name:'Напиток',quantity:1,price:300}]),total_amount:300,paid_amount:0,payment_method:'cash',payment_status:'pending',created_at:new Date().toISOString(),scheduled_for:'2099-10-01T07:00:00+00:00',is_future_preorder:true,preparation_due_at:'2099-10-01T06:30:00+00:00'};
 const state={order,blocked:false,closed:false,report:null as any,writes:[] as any[],quote:null as any,manual:null as any,failClose:false};
 await page.addInitScript(()=>{localStorage.setItem('app_lang','ru');localStorage.setItem('dam_operator_workstation','device');sessionStorage.setItem('dam_workstation_session','operator');sessionStorage.setItem('s24_welcome_done','1');});
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.route('**/api/**',async r=>{
  const url=new URL(r.request().url()),p=url.pathname,method=r.request().method();let json:any={items:[],total:0};
  const blockers=()=>({can_close:!state.blocked,orders:state.blocked?[{id:71,status:'in_progress',label:'В доставке',courier:'Алсу'}]:[],counts:state.blocked?{in_progress:1}:{}});
  if(p.endsWith('/modules'))json={food:true,dam_alem:true,account:true};
  if(p.endsWith('/business/me'))json={role:'operator',name:'Айжан'};
  if(p.endsWith('/shifts/me'))json={staff:{id:1,name:'Айжан',role:'operator',pin_set:true},shift:state.closed?null:{id:9,staff_name:'Айжан',role:'operator',active:true,opened_at:new Date().toISOString()}};
  if(p.endsWith('/shifts/close-preview'))json=blockers();
  if(p.endsWith('/shifts/close')){
   if(state.failClose){state.blocked=true;return r.fulfill({status:409,json:{detail:{...blockers(),code:'active_orders',message:'Появился активный заказ'}}});}
   state.report=r.request().postDataJSON();state.closed=true;json={shift:null};
  }
  if(p.endsWith('/business/availability'))json=[];
  if(p.endsWith('/operations/order-counts'))json={preorders:order.is_future_preorder?1:0,[order.status]:order.is_future_preorder?0:1,all:1};
  if(p.endsWith('/operations/orders')){const status=url.searchParams.get('status');const visible=status==='preorders'?order.is_future_preorder:!order.is_future_preorder;json={items:visible?[order]:[],total:visible?1:0};}
  if(p.endsWith('/operations/orders/71')){
   if(method==='PATCH'){const b=r.request().postDataJSON();state.writes.push(b);expect(b.expected_version).toBe(order.version);Object.assign(order,b);order.version++;if(b.status==='preparing')order.is_future_preorder=false;}
   json={order,events:[]};
  }
  if(p.endsWith('/operations/catalog'))json={products:[{id:2,name:'Напиток',price:300}],groups:[],options:[],links:[]};
  if(p.endsWith('/manual/quote')){
   const b=r.request().postDataJSON();state.quote=b;
   if(b.promo_code==='BAD')return r.fulfill({status:400,json:{detail:'Промокод недействителен'}});
   const quantity=b.items.reduce((s:number,i:any)=>s+i.quantity,0),discount=b.promo_code==='TEST'?100:0;
   json={items:[{name:'Напиток',quantity,sum:quantity*300}],subtotal:quantity*300,total_amount:quantity*300-discount,discount,promo_code:b.promo_code||undefined};
  }
  if(p.endsWith('/manual')){state.manual=r.request().postDataJSON();json={...order,id:72};}
  await r.fulfill({json});
 });
 return state;
}

test('close preview blocks active deliveries and links the specific order',async({page})=>{
 const s=await setup(page);s.blocked=true;
 await page.goto('/partner/dam-alem/operator');
 await page.locator('input[placeholder="••••"]').fill('2222');await page.getByRole('button',{name:'Закрыть смену',exact:true}).click();
 const dialog=page.getByRole('dialog');
 await expect(dialog.getByRole('heading',{name:'Смену пока нельзя закрыть'})).toBeVisible();
 await expect(dialog.getByText(/№71 — В доставке — курьер Алсу/)).toBeVisible();
 await expect(dialog.getByRole('button',{name:'Сохранить закуп и закрыть смену'})).toHaveCount(0);
 await dialog.getByRole('button',{name:/№71/}).click();await expect(page).toHaveURL(/order=71/);expect(s.closed).toBe(false);
});

test('structured procurement is required; server rejects a new order arriving during close',async({page})=>{
 const s=await setup(page);
 await page.goto('/partner/dam-alem/operator');
 await page.locator('input[placeholder="••••"]').fill('2222');await page.getByRole('button',{name:'Закрыть смену',exact:true}).click();
 const dialog=page.getByRole('dialog'),save=dialog.getByRole('button',{name:'Сохранить закуп и закрыть смену'});
 await expect(save).toBeDisabled();
 await dialog.getByLabel('Наименование',{exact:true}).fill('Сыр');await dialog.getByLabel('Количество',{exact:true}).fill('2');
 await dialog.getByLabel('Комментарий к позиции').fill('Моцарелла');
 await expect(save).toBeEnabled();s.failClose=true;await save.click();
 await expect(dialog.getByRole('heading',{name:'Смену пока нельзя закрыть'})).toBeVisible();expect(s.closed).toBe(false);
 s.failClose=false;s.blocked=false;await dialog.getByRole('button',{name:'Проверить снова'}).click();
 await expect(save).toBeEnabled();await save.click();await expect(dialog).toHaveCount(0);
 expect(s.report.shift_id).toBe(9);expect(s.report.procurement.items).toEqual([{name:'Сыр',quantity:2,unit:'кг',comment:'Моцарелла'}]);expect(s.closed).toBe(true);
});

test('preorder reschedule and early kitchen require explicit action',async({page})=>{
 const s=await setup(page);
 await page.goto('/partner/dam-alem/operator?section=orders&status=preorders&order=71');
 await expect(page.getByRole('button',{name:'Все активные 0',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Перенести предзаказ',exact:true}).click();
 const dialog=page.getByRole('dialog');await dialog.getByLabel('Дата и время (UTC+5)').fill('2099-10-02T13:00');await dialog.getByRole('button',{name:'Сохранить время'}).click();
 await expect.poll(()=>s.order.scheduled_for).toBe('2099-10-02T08:00:00.000Z');
 await page.getByRole('button',{name:'Подтвердить предзаказ',exact:true}).click();
 await expect.poll(()=>s.order.status).toBe('confirmed');expect(s.order.is_future_preorder).toBe(true);
 await page.getByRole('button',{name:'Начать приготовление раньше',exact:true}).click();expect(s.order.status).toBe('confirmed');
 await expect(page.getByRole('dialog')).toContainText('будет блокировать закрытие смены');
 await page.getByRole('button',{name:'Да, начать приготовление'}).click();
 await expect.poll(()=>s.order.status).toBe('preparing');expect(s.writes.at(-1).start_early).toBe(true);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});

test('manual preorder uses UTC+5 and server promo recalculation',async({page},info)=>{
 const s=await setup(page);
 await page.goto('/partner/dam-alem/operator?section=orders');
 await page.getByRole('button',{name:'Новый заказ',exact:true}).click();
 const modal=page.getByRole('dialog');await modal.getByRole('combobox',{name:'Получение',exact:true}).selectOption('dine_in');
 await modal.getByRole('button',{name:/Напиток/}).click();
 await modal.getByLabel('Предзаказ',{exact:true}).check();
 await expect(modal.getByRole('button',{name:/Создать заказ/})).toBeDisabled();
 await modal.getByLabel('Дата и время',{exact:true}).fill('2099-10-02T12:00');
 await modal.getByLabel('Промокод',{exact:true}).fill('BAD');await modal.getByRole('button',{name:'Применить',exact:true}).click();
 await expect(modal.getByRole('alert')).toContainText('Промокод недействителен');await expect(modal.getByRole('button',{name:/Создать заказ/})).toBeDisabled();
 await modal.getByLabel('Промокод',{exact:true}).fill('TEST');await modal.getByRole('button',{name:'Применить',exact:true}).click();
 await expect(modal.getByText('✓ Промокод TEST применён')).toBeVisible();
 await expect(modal.getByRole('button',{name:/Создать заказ — 200/})).toBeEnabled();
 await modal.getByRole('button',{name:/Напиток.*300/}).click();
 await expect(modal.getByRole('button',{name:/Создать заказ — 500/})).toBeEnabled();
 expect(await modal.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
 await page.screenshot({path:info.outputPath('manual-preorder-promo.png')});
 await modal.getByRole('button',{name:/Создать заказ — 500/}).click();
 await expect(modal).toHaveCount(0);
 expect(s.manual.scheduled_for).toBe('2099-10-02T07:00:00.000Z');expect(s.manual.promo_code).toBe('TEST');expect(s.manual.quoted_total).toBe(500);expect(s.manual.delivery_method).toBe('dine_in');expect(s.manual.delivery_address).toBe('');
});

test('courier on shift receives assignments while offline and completes one of three independently',async({page},info)=>{
 await page.clock.install();
 await page.addInitScript(()=>{localStorage.setItem('app_lang','ru');localStorage.setItem('s24_dam_courier_token','test');sessionStorage.setItem('s24_welcome_done','1');});
 let tasks:any[]=[];const completed:number[]=[];
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.route('**/api/**',async r=>{
  const p=new URL(r.request().url()).pathname;let json:any={items:[],total:0};
  if(p.endsWith('/modules'))json={food:true};
  if(p.endsWith('/courier/cabinet'))json={profile:{verified:true,online:false,phone:'+77001111111',vehicle_type:'bike',rating:5,deliveries_count:0},shift:{id:9,staff_name:'Алсу',opened_at:new Date().toISOString()},pin_set:true,offered_task:null,active_task:tasks[0]||null,active_tasks:tasks,available_tasks:[],task_history:[],earnings:0,status_flow:{}};
  if(/\/tasks\/\d+\/status$/.test(p)){const id=Number(p.split('/').at(-2));expect(r.request().postDataJSON().status).toBe('delivered');completed.push(id);tasks=tasks.filter(t=>t.id!==id);json={ok:true};}
  await r.fulfill({json});
 });
 await page.goto('/food/courier');await expect(page.getByText(/Смена с/)).toBeVisible();
 tasks=[1,2,3].map(id=>({id,source_type:'food_orders',source_id:id,status:'on_the_way',pickup_address:'Заведение',dropoff_address:'Улица '+id,customer_name:'Клиент '+id,customer_phone:'+7700000000'+id,total_amount:id*1000,amount_due:id*1000,payment_method:'cash',payment_status:'pending',order_status:'in_progress',order_source:'operator',order_items:'[]'}));
 await page.clock.runFor(5000);await expect(page.getByRole('heading',{name:'Мои доставки — 3'})).toBeVisible();
 await expect(page.getByText('Получить у клиента: 2 000 ₸',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Доставлено',exact:true}).nth(1).click();
 await page.getByRole('button',{name:'Не получил оплату',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Мои доставки — 2'})).toBeVisible();
 expect(completed).toEqual([2]);expect(tasks.map(t=>t.id)).toEqual([1,3]);
 await page.reload();await expect(page.getByRole('heading',{name:'Мои доставки — 2'})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.screenshot({path:info.outputPath('multiple-deliveries.png'),fullPage:true});
});
