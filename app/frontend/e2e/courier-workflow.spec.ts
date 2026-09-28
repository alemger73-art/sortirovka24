import {test,expect,type Page} from '@playwright/test';
async function setup(page:Page,authenticated=true) {
  page.on('pageerror',error=>{throw error;});
  const s={shift:authenticated,online:false,tasks:[] as Array<Record<string,unknown>>,completed:[] as number[],opens:0,closes:0,issues:[] as unknown[],dropReply:false,failReads:false,
    money:{collected:0,handed_over:0,cash_balance:0,earned:0,earned_total:0,paid_total:0,payout_due:0,deliveries:0,pending_handover:null as number|null,shift_id:9,events:[]}};
  await page.addInitScript((auth)=>{localStorage.setItem('app_lang','ru');sessionStorage.setItem('s24_welcome_done','1');if(auth)localStorage.setItem('s24_dam_courier_token','test');},authenticated);
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  await page.route('**/api/**',async r=>{
    const p=new URL(r.request().url()).pathname;let json:unknown={items:[],total:0};
    if(p.endsWith('/modules'))json={food:true};
    if(p.endsWith('/pin-login'))json={token:'test',name:'Тестовый курьер'};
    if(p.endsWith('/shift/open')){await new Promise(resolve=>setTimeout(resolve,1000));s.shift=true;s.opens++;json={shift:{id:9}};}
    if(p.endsWith('/online')){s.online=true;json={online:true};}
    if(p.endsWith('/courier/cabinet')){if(s.failReads)return r.abort('connectionfailed');json={profile:{name:'Тестовый курьер',verified:true,online:s.online,phone:'+77000000000',vehicle_type:'bike'},shift:s.shift?{id:9,staff_name:'Тестовый курьер',opened_at:new Date().toISOString()}:null,active_tasks:s.tasks,task_history:[],earnings:s.money.earned,money:s.money};}
    if(/\/tasks\/\d+\/status$/.test(p)){const id=Number(p.split('/').at(-2));if(r.request().postDataJSON().cash_received){s.money.collected+=1200;s.money.cash_balance+=1200;}s.money.earned+=800;s.money.payout_due+=800;s.money.deliveries++;s.completed.push(id);s.tasks=s.tasks.filter(t=>t.id!==id);json={status:'delivered'};if(s.dropReply){s.dropReply=false;return r.abort('connectionfailed');}}
    if(p.endsWith('/issue')){s.issues.push(r.request().postDataJSON());json={id:1,status:'open'};}
    if(p.endsWith('/cash-handover')){s.money.pending_handover=1;json={id:1,amount:s.money.cash_balance};}
    if(p.endsWith('/shift/close')){if(s.tasks.length||s.money.cash_balance)return r.fulfill({status:409,json:{detail:'Есть доставки или наличные'}});s.shift=false;s.closes++;json={shift:null};}
    await r.fulfill({json});
  });return s;
}
test('delayed shift open never exposes a stale working screen',async({page})=>{
 const s=await setup(page,false);await page.goto('/food/courier');
 await page.getByLabel('PIN курьера').fill('2954');await page.getByRole('button',{name:'Войти и начать смену'}).click();
 await expect(page.getByRole('heading',{name:'Мои доставки — 0'})).toBeVisible();
 await expect(page.getByText('Смена не открыта',{exact:true})).toHaveCount(0);
 expect(s.shift).toBe(true);expect(s.online).toBe(true);expect(s.opens).toBe(1);
});

test('courier prints the current order snapshot from delivery details',async({page})=>{
 const s=await setup(page);
 await page.addInitScript(()=>{window.print=()=>{};});
 s.tasks.push({id:9,source_id:14,status:'arrived',dropoff_address:'Адрес из списка',payment_method:'cash',amount_due:1200});
 await page.route('**/api/v1/logistics/tasks/9',async r=>{
   expect(r.request().headers().authorization).toBe('Bearer test');
   await r.fulfill({json:{id:9,receipt:{id:14,restaurant_name:'DAM ALEM 2.0',created_at:'2026-09-28T15:16:00Z',delivery_method:'delivery',delivery_address:'Актуальный адрес чека',payment_method:'halyk_qr',payment_status:'paid',total_amount:1200,paid_amount:1200,amount_due:0,order_items:JSON.stringify([{name:'Блюдо из заказа',quantity:1,sum:1200}])}}});
 });
 await page.goto('/food/courier');await page.getByText('Состав заказа и детали',{exact:true}).click();
 await page.getByRole('button',{name:'Распечатать чек'}).click();
 const receipt=page.frameLocator('#receipt-print-frame');
 await expect(receipt.getByText('Актуальный адрес чека')).toBeVisible();
 await expect(receipt.getByText('HALYK',{exact:true})).toBeVisible();
 await expect(receipt.getByRole('img',{name:'Открыть меню DAM ALEM 2.0'})).toBeVisible();
 await expect(receipt.getByText('28.09.2026   20:16')).toBeVisible();
 expect(s.completed).toEqual([]);
});

test('cash delivery, controlled handover, shift summary and logout',async({page},info)=>{
 const s=await setup(page);s.tasks.push({id:1,source_id:7,status:'arrived',dropoff_address:'Тестовый адрес',customer_phone:'+77000000000',payment_method:'cash',amount_due:1200,total_amount:1200,courier_payout:800});
 await page.goto('/food/courier');await page.getByRole('button',{name:'Доставлено',exact:true}).click();
 await page.getByRole('button',{name:'Подтвердить получение и доставку'}).click();
 await expect(page.getByRole('heading',{name:'Мои доставки — 0'})).toBeVisible();
 await page.getByRole('navigation',{name:'Кабинет курьера'}).getByRole('button',{name:'Профиль',exact:true}).click();
 await page.getByLabel('PIN для смены').fill('2954');await page.getByRole('button',{name:'Закрыть смену',exact:true}).click();
 await expect(page.getByRole('dialog')).toContainText('Наличные у вас: 1 200');
 expect(s.closes).toBe(0);await page.getByRole('dialog').getByRole('button',{name:'Передать наличные'}).click();
 await page.getByRole('button',{name:'Передать наличные',exact:true}).click();
 await expect(page.getByRole('button',{name:'Ожидаем подтверждение оператора'})).toBeDisabled();
 expect(s.money.cash_balance).toBe(1200);
 await page.screenshot({path:info.outputPath('cash-awaiting-confirmation.png'),fullPage:true});
 // Represents the operator's confirmed server response, not a courier-side balance edit.
 s.money.cash_balance=0;s.money.handed_over=1200;s.money.pending_handover=null;
 await page.getByRole('button',{name:'Обновить',exact:true}).click();
 await page.getByRole('navigation',{name:'Кабинет курьера'}).getByRole('button',{name:'Профиль',exact:true}).click();
 await page.getByRole('button',{name:'Закрыть смену',exact:true}).click();
 await page.getByRole('button',{name:'Подтвердить закрытие смены',exact:true}).click();
 await expect(page.getByText('Смена не открыта',{exact:true})).toBeVisible();expect(s.closes).toBe(1);
 await page.getByRole('button',{name:'Выйти из кабинета',exact:true}).click();await expect(page.getByLabel('PIN курьера')).toBeVisible();
 expect(await page.evaluate(()=>localStorage.getItem('s24_dam_courier_token'))).toBeNull();
});

test('issue validation, GPS denial and lost delivery response reconcile safely',async({page},info)=>{
 await page.clock.install();
 await page.clock.pauseAt(new Date(Date.now()+1000)); // install alone keeps real-time polling running.
 const s=await setup(page);s.tasks.push({id:1,source_id:7,status:'arrived',dropoff_address:'Тестовый адрес',customer_phone:'+77000000000',payment_method:'cash',amount_due:1200,total_amount:1200});
 await page.goto('/food/courier');await page.getByRole('button',{name:'Проблема',exact:true}).click();
 await page.getByLabel('Причина проблемы').selectOption('other');await expect(page.getByRole('button',{name:'Сообщить оператору'})).toBeDisabled();
 await page.getByLabel('Комментарий',{exact:true}).fill('Клиент просит подождать');
 await page.screenshot({path:info.outputPath('delivery-issue.png'),fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.getByRole('button',{name:'Сообщить оператору'}).click();expect(s.issues).toEqual([{reason:'other',comment:'Клиент просит подождать'}]);
 await expect(page.getByText('Нет разрешения GPS',{exact:true})).toBeVisible();
 s.failReads=true;await page.getByRole('button',{name:'Обновить',exact:true}).click();await expect(page.getByRole('button',{name:'Повторить загрузку'})).toBeVisible();
 s.failReads=false;await page.getByRole('button',{name:'Повторить загрузку'}).click();await expect(page.getByRole('button',{name:'Повторить загрузку'})).toHaveCount(0);
 s.dropReply=true;await page.getByRole('button',{name:'Доставлено',exact:true}).click();await page.getByRole('button',{name:'Не получил оплату'}).click();
 await expect(page.getByRole('heading',{name:'Мои доставки — 0'})).toBeVisible();await expect(page.getByRole('dialog')).toHaveCount(0);expect(s.completed).toEqual([1]);
});

test('active shift cannot close and logout does not close it',async({page})=>{
 const s=await setup(page);s.tasks.push({id:1,source_id:7,status:'arrived',dropoff_address:'Тестовый адрес',payment_method:'halyk_qr',amount_due:1200});
 await page.goto('/food/courier');await page.getByRole('navigation',{name:'Кабинет курьера'}).getByRole('button',{name:'Профиль',exact:true}).click();
 await page.getByLabel('PIN для смены').fill('2954');await page.getByRole('button',{name:'Закрыть смену',exact:true}).click();
 await expect(page.getByRole('dialog')).toContainText('№7');await expect(page.getByRole('button',{name:'Подтвердить закрытие смены'})).toHaveCount(0);
 await page.getByRole('button',{name:'Назад',exact:true}).click();await page.getByRole('button',{name:'Выйти из кабинета'}).click();
 expect(s.closes).toBe(0);expect(s.shift).toBe(true);await expect(page.getByLabel('PIN курьера')).toBeVisible();
});
test('three assignments alert independently; mobile actions and refresh',async({page},info)=>{
 await page.clock.install();const s=await setup(page);await page.goto('/food/courier');
 await expect(page.getByRole('heading',{name:'Мои доставки — 0'})).toBeVisible();
 for(const id of [1,2,3]){
   s.tasks.push({id,source_id:id,status:'arrived',dropoff_address:'Улица '+id,customer_name:'Клиент',customer_phone:'+77000000000',payment_method:'cash',amount_due:1200,total_amount:1200,order_items:'[]'});
   await page.clock.runFor(5100);await expect(page.getByText('Новая доставка №'+id,{exact:true})).toBeVisible();
 }
 const call=page.getByRole('link',{name:'Позвонить'}).first();const box=await call.boundingBox();expect(box?.height).toBeGreaterThanOrEqual(48);expect(box?.y).toBeLessThan(650);
 expect((await page.getByRole('link',{name:'Маршрут'}).first().boundingBox())?.height).toBeGreaterThanOrEqual(48);
 await page.getByRole('button',{name:'Доставлено',exact:true}).nth(1).click();
 await page.getByRole('button',{name:'Не получил оплату',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Мои доставки — 2'})).toBeVisible();expect(s.completed).toEqual([2]);
 await page.reload();await expect(page.getByRole('heading',{name:'Мои доставки — 2'})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.screenshot({path:info.outputPath('deliveries-light.png'),fullPage:true});
 await page.evaluate(()=>document.documentElement.classList.add('dark'));
 await page.screenshot({path:info.outputPath('deliveries-dark.png'),fullPage:true});
});
