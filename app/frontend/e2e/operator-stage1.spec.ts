import {test,expect,type Page} from '@playwright/test';

// Browser behaviour against a controlled API. Actual transactions/RBAC are
// covered separately in test_dam_operator_stage1.py, not mocked here as proof.
async function setup(page:Page, fulfillment='delivery', source='app') {
  const order={id:71,version:0,status:'new',order_source:source,customer_name:'Клиент',customer_phone:'+77000000000',
    delivery_method:fulfillment,delivery_address:'Тестовая 1',order_items:JSON.stringify([{id:1,name:'Пицца',quantity:1,price:1000}]),
    total_amount:1000,paid_amount:0,payment_method:'cash',payment_status:'pending',comment:'',created_at:new Date().toISOString(),operator_note:'',cancellation_reason:''};
  const state={order,pinEntries:0,closed:0,shift:true,expired:false,delivery:null as any,alertTotal:1};
  await page.addInitScript(()=>{
    localStorage.setItem('app_lang','ru');localStorage.setItem('dam_operator_workstation','device');
    if(!sessionStorage.getItem('test_seeded')){sessionStorage.setItem('dam_workstation_session','operator');sessionStorage.setItem('test_seeded','1');}
    sessionStorage.setItem('s24_welcome_done','1');
  });
  // Do not restore tokens on later reloads: these are the application's responsibility.
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  await page.route('**/api/**',async r=>{
    const url=new URL(r.request().url()),path=url.pathname,method=r.request().method();
    let json:any={items:[],total:0};
    const shift=()=>state.shift?{id:9,staff_name:'Айжан',role:'operator',active:true,opened_at:'2026-09-27T06:00:00Z'}:null;
    if(path.endsWith('/modules'))json={food:true,dam_alem:true,account:true};
    if(path.endsWith('/shifts/me')){
      if(state.expired)return r.fulfill({status:403,json:{detail:'Доступ отключён'}});
      json={staff:{id:2,name:'Айжан',role:'operator',pin_set:true},shift:shift()};
    }
    if(path.endsWith('/shifts/close-preview'))json={can_close:true,orders:[],counts:{}};
    if(path.endsWith('/shifts/close')){state.closed++;state.shift=false;json={shift:null};}
    if(path.endsWith('/workstation/enter')){state.pinEntries++;state.shift=true;json={token:'operator',name:'Айжан',shift:shift()};}
    if(path.endsWith('/business/me'))json={role:'operator',name:'Айжан'};
    if(path.endsWith('/business/today'))json={counts:{[order.status]:1},unpaid:1,notification_errors:0,new_orders:[]};
    if(path.endsWith('/operations/order-counts'))json={all:1,[order.status]:1,ready_all:order.status==='ready'?1:0};
    if(path.endsWith('/operations/couriers'))json={items:[
      {id:'offline',name:'Не на смене',on_shift:false,online:false,active_delivery:false,assignable:false},
      {id:'busy',name:'Занятый',on_shift:true,online:true,active_delivery:true,active_deliveries:2,assignable:true},
      {id:'ready',name:'Алсу',on_shift:true,online:true,active_delivery:false,assignable:true},
    ]};
    if(path.endsWith('/operations/orders')){
      const status=url.searchParams.get('status');const visible=!status||status==='active'||status===order.status;
      json={items:visible?[order]:[],total:visible?(status==='new'?state.alertTotal:1):0};
    }
    if(path.endsWith('/operations/orders/71')){
      if(method==='PATCH'){
        const payload=r.request().postDataJSON();expect(payload.expected_version).toBe(order.version);
        Object.assign(order,payload);order.version++;json=order;
      }else json={order,events:[],delivery:state.delivery};
    }
    if(path.endsWith('/assign-courier')){
      expect(r.request().postDataJSON().courier_id).toBe('ready');order.status='in_progress';order.version++;
      state.delivery={id:1,status:'on_the_way',courier_name:'Алсу',courier_phone:'+77001111111'};json=state.delivery;
    }
    await r.fulfill({json});
  });
  return state;
}

test('new alert, explicit acceptance, kitchen and eligible courier',async({page})=>{
  const state=await setup(page);state.alertTotal=31;
  await page.goto('/partner/dam-alem/operator?section=orders&order=71');
  await expect(page.getByRole('button',{name:'Принять заказ',exact:true})).toHaveCount(0);
  await expect(page).toHaveTitle(/^\(31\)/);
  await expect(page.getByRole('button',{name:'Передать на кухню',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Передать на кухню',exact:true}).click();
  await page.getByRole('button',{name:'Готово',exact:true}).click();
  const select=page.getByLabel('Выберите курьера');
  await expect(select.locator('option[value="offline"]')).toHaveJSProperty('disabled',true);
  await expect(select.locator('option[value="busy"]')).toHaveJSProperty('disabled',false);
  await select.selectOption('ready');await page.getByRole('button',{name:'Назначить курьера',exact:true}).click();
  await expect(page.getByText(/Курьер: Алсу/)).toBeVisible();
  expect(state.order.payment_status).toBe('pending');
  await expect(page.getByRole('region',{name:'Оплата заказа'})).toContainText('Ожидает оплаты');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});

test('refresh preserves session, lock requires PIN, close is separate',async({page})=>{
  const state=await setup(page);
  await page.goto('/partner/dam-alem/operator');
  await expect(page.getByRole('button',{name:'Заблокировать рабочее место',exact:true})).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button',{name:'Заблокировать рабочее место',exact:true})).toBeVisible();
  expect(state.pinEntries).toBe(0);expect(state.closed).toBe(0);
  await page.getByRole('button',{name:'Заблокировать рабочее место',exact:true}).click();
  await expect(page.getByLabel('PIN оператора')).toHaveAttribute('type','password');
  expect(await page.evaluate(()=>sessionStorage.getItem('dam_workstation_session'))).toBeNull();
  expect(state.closed).toBe(0);expect(state.shift).toBe(true);
  await page.reload();await expect(page.getByLabel('PIN оператора')).toBeVisible();
  await page.getByLabel('PIN оператора').fill('1234');
  await page.getByRole('button',{name:'Войти и открыть смену',exact:true}).click();
  expect(state.pinEntries).toBe(1);
  await page.locator('input[placeholder="••••"]').fill('1234');
  await page.getByRole('button',{name:'Закрыть смену',exact:true}).click();
  await page.getByLabel('Закуп не требуется',{exact:true}).check();
  await page.getByLabel('Причина',{exact:true}).fill('Остатков достаточно');
  await page.getByRole('button',{name:'Сохранить закуп и закрыть смену',exact:true}).click();
  await expect.poll(()=>state.closed).toBe(1);
  expect(state.shift).toBe(false);
});

for(const fulfillment of ['pickup','dine_in'])test(`${fulfillment} does not require a courier; closed history is read-only`,async({page})=>{
  const state=await setup(page,fulfillment,'whatsapp');state.order.status='ready';
  await page.goto('/partner/dam-alem/operator?section=orders&order=71');
  await expect(page.getByRole('button',{name:'Назначить курьера',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Выдать заказ',exact:true}).click();
  expect(state.order.status).toBe('done');expect(state.order.order_source).toBe('whatsapp');
  await expect(page.getByText(/Заказ завершён без подтверждения денег/)).toBeVisible();
  await expect(page.getByRole('button',{name:'Изменить состав заказа',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Подтвердить получение оплаты',exact:true})).toBeVisible();
});

test('customer checkout offers pickup and reserves dine-in for staff',async({page})=>{
  await page.addInitScript(()=>{localStorage.setItem('app_lang','ru');sessionStorage.setItem('s24_welcome_done','1');});
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  await page.route('**/api/**',async r=>{
    const path=new URL(r.request().url()).pathname;let json:any={items:[],total:0};
    if(path.endsWith('/modules'))json={food:true};
    if(path.includes('food_restaurants'))json={items:[{id:1,name:'DAM ALEM 2.0'}]};
    if(path==='/api/categories')json={categories:[{id:1,name:'Напитки',slug:'drinks'}]};
    if(path==='/api/products')json={products:[{id:1,category_id:1,title:'Лимонад',price:600,available:true}]};
    // Storefront now consumes the shared menu contract, not /api/products.
    if(path==='/api/v1/dam-alem/menu/catalog')json={business_id:'dam_alem',restaurant_id:1,categories:[{id:1,name:'Напитки',slug:'drinks'}],products:[{id:1,restaurant_id:1,category_id:1,name:'Лимонад',price:600,available:true,is_active:true,sellable:true,modifiers_enabled:false,modifier_groups:[]}],groups:[],options:[],links:[]};
    if(path.includes('food_settings'))json={items:Object.entries({min_order_amount:'3000',service_fee_rate:'0.1',promo_codes:'[]',loyalty_gifts:'[]',kitchen_open:'00:00',kitchen_close:'00:00'}).map(([setting_key,setting_value])=>({setting_key,setting_value}))};
    await r.fulfill({json});
  });
  await page.goto('/food');
  await page.locator('.dam-grid-card').filter({hasText:'Лимонад'}).first().getByRole('button',{name:'В корзину',exact:true}).click();
  await page.getByTestId('dam-cart-open').click();
  await expect(page.getByTestId('dam-cart-checkout')).toBeDisabled();
  await expect(page.getByRole('group',{name:'Способ получения заказа'}).getByRole('button',{name:'На месте',exact:true})).toHaveCount(0);
  await page.getByRole('group',{name:'Способ получения заказа'}).getByRole('button',{name:'Самовывоз',exact:true}).click();
  await expect(page.getByTestId('dam-cart-checkout')).toBeDisabled();
  for (let i=0;i<4;i++) await page.getByRole('button',{name:'Плюс',exact:true}).click();
  await expect(page.getByTestId('dam-cart-checkout')).toBeEnabled();
  await page.getByTestId('dam-cart-checkout').click();
  await expect(page.getByTestId('dam-checkout')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
