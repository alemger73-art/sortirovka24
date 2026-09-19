import {test, expect, type Page} from '@playwright/test';

async function setup(page: Page) {
 const state = {writes: 0, payload: null as any, queries: [] as string[], fail: false};
 const order = {id: 92, order_source: 'operator', status: 'new', customer_name: 'Асель', customer_phone: '+77001112233', delivery_method: 'pickup', total_amount: 1300, order_items: '[]', created_at: '2026-09-19T10:00:00Z', payment_method: 'cash', payment_status: 'pending', version: 0};
 await page.addInitScript(() => {localStorage.setItem('app_lang','ru');localStorage.setItem('sortirovka-theme','dark');localStorage.setItem('_partner_token_dam_alem','test');localStorage.setItem('_dam_alem_partner_token','test');});
 await page.route('**/*', r => new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort());
 await page.route('**/api/**', async r => {
  const url = new URL(r.request().url()), path = url.pathname;
  let json: any = {items: [], total: 0};
  if (path.includes('verify-session')) json = {valid:true,display_name:'Оператор'};
  if (path.endsWith('/business/me')) json = {role:'operator',name:'Оператор'};
  if (path.endsWith('/business/today')) json = {counts:{new:2,preparing:3,ready:1},unpaid:4,notification_errors:0,daily:{created:6,order_total:12000}};
  if (path.endsWith('/operations/catalog')) json = {
   categories:[{id:1,name:'Пиццы'},{id:2,name:'Лимонады'}],
   products:[{id:1,name:'Пепперони',price:3200,category_id:1},{id:2,name:'Мохито',price:1300,category_id:2}],
   groups:[{id:1,name:'Объём',is_required:true,min_select:1,max_select:1}],
   options:[{id:1,group_id:1,name:'0,5 л',price:0},{id:2,group_id:1,name:'0,65 л',price:200}],links:[{food_item_id:2,modifier_group_id:1}]
  };
  if (path.endsWith('/operations/customer')) json = {name:'Асель',addresses:['Абая, 10'],recent_orders:[{id:18,amount:5000,status:'done'}]};
  if (path.endsWith('/operations/orders')) {state.queries.push(url.search);json={items:state.writes ? [order] : [],total:state.writes ? 1 : 0};}
  if (path.endsWith('/orders/92')) json = {order,events:[]};
  if (path.endsWith('/manual/quote')) {
   if (state.fail) {await r.fulfill({status:409,json:{detail:'Блюдо временно недоступно'}});return;}
   const body=r.request().postDataJSON();
   const subtotal=body.items.reduce((sum:number,line:any)=>sum+((line.id===1?3200:1300)+(line.modifiers.some((m:any)=>m.option_id===2)?200:0))*line.quantity,0);
   const delivery=body.delivery_method==='delivery'?600:0;
   json={items:[],subtotal,delivery_fee:delivery,discount:0,total_amount:subtotal+delivery};
  }
  if (path.endsWith('/manual')) {state.writes++;state.payload=r.request().postDataJSON();Object.assign(order,{total_amount:state.payload.quoted_total});json=order;}
  await r.fulfill({json});
 });
 return state;
}

test('catalog categories, quantities, different volumes and automatic total',async({page},info)=>{
 const s=await setup(page);await page.goto('/partner/dam-alem?section=orders');
 await expect(page.getByText('Создано за сегодня:',{exact:false})).toBeVisible();
 await page.getByRole('button',{name:'Новый заказ',exact:true}).click();
 const modal=page.getByRole('dialog');
 await modal.getByLabel('Получение').selectOption('dine_in');
 await modal.getByRole('button',{name:'Лимонады',exact:true}).click();
 await expect(modal.getByRole('button',{name:/Пепперони/})).toHaveCount(0);
 await modal.getByRole('button',{name:/Мохито.*1.*300/}).click();
 await modal.getByRole('button',{name:/Мохито.*1.*300/}).click();
 await expect(modal.getByLabel('Количество Мохито',{exact:true})).toHaveValue('2');
 await modal.getByRole('radio',{name:/0,65 л/}).check();
 await expect(modal.getByRole('button',{name:/Создать заказ — 3.*000/})).toBeEnabled();
 await modal.getByRole('button',{name:'Ещё вариант',exact:true}).click();
 await expect(modal.getByLabel('Количество Мохито',{exact:true})).toHaveCount(2);
 await expect(modal.getByRole('button',{name:/Создать заказ — 4.*300/})).toBeEnabled();
 await modal.getByRole('button',{name:'Уменьшить Мохито',exact:true}).first().click();
 await expect(modal.getByRole('button',{name:/Создать заказ — 2.*800/})).toBeEnabled();
 expect(await modal.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
 await page.screenshot({path:info.outputPath('operator-pos.png')});
 await modal.getByRole('button',{name:/Создать заказ — 2.*800/}).click();
 await expect(modal).toHaveCount(0);
 expect(s.writes).toBe(1);expect(s.payload.items.map((x:any)=>x.quantity)).toEqual([1,1]);
 expect(s.payload.items[0].modifiers).toEqual([{option_id:2}]);expect(s.payload.items[1].modifiers).toEqual([{option_id:1}]);
 await expect(page.getByRole('heading',{name:'Заказ №92',exact:true})).toBeVisible();
 await expect(page.getByRole('region',{name:'Список заказов',exact:true})).toContainText('Оператор');
});

test('CRM lookup is editable and delivery switches automatically',async({page})=>{
 await setup(page);await page.goto('/partner/dam-alem?section=orders');await page.getByRole('button',{name:'Новый заказ',exact:true}).click();
 const m=page.getByRole('dialog');await m.getByLabel('Телефон клиента').fill('+77001112233');
 await m.getByRole('button',{name:'Подставить данные · Асель'}).click();
 await expect(m.getByLabel('Имя клиента')).toHaveValue('Асель');await expect(m.getByLabel('Адрес доставки',{exact:true})).toHaveValue('Абая, 10');
 await m.getByLabel('Имя клиента').fill('Асель — новый заказ');await m.getByRole('button',{name:/Пепперони/}).click();
 await expect(m.getByRole('button',{name:/Создать заказ — 3.*800/})).toBeEnabled();
 await m.getByLabel('Получение').selectOption('pickup');await expect(m.getByLabel('Адрес доставки',{exact:true})).toHaveCount(0);
 await expect(m.getByRole('button',{name:/Создать заказ — 3.*200/})).toBeEnabled();
 await m.getByRole('button',{name:'Убрать',exact:true}).click();await expect(m.getByRole('button',{name:/Создать заказ/})).toBeDisabled();
});

test('failed automatic quote cannot create an order and can recover',async({page})=>{
 const s=await setup(page);s.fail=true;await page.goto('/partner/dam-alem?section=orders');await page.getByRole('button',{name:'Новый заказ',exact:true}).click();
 const m=page.getByRole('dialog');await m.getByLabel('Получение').selectOption('dine_in');await m.getByRole('button',{name:/Пепперони/}).click();
 await expect(m.getByRole('alert')).toContainText('Блюдо временно недоступно');await expect(m.getByRole('button',{name:/Создать заказ/})).toBeDisabled();expect(s.writes).toBe(0);
 s.fail=false;await m.getByRole('button',{name:'Повторить проверку'}).click();await expect(m.getByRole('button',{name:/Создать заказ — 3.*200/})).toBeEnabled();
});

test('queue sends status and source filters to the server',async({page})=>{
 const s=await setup(page);await page.goto('/partner/dam-alem?section=orders');
 await page.getByLabel('Источник заказа',{exact:true}).selectOption('app');
 await page.getByRole('navigation',{name:'Статус заказов',exact:true}).getByRole('button',{name:'В работе',exact:true}).click();
 await expect.poll(()=>s.queries.some(q=>q.includes('status=working')&&q.includes('source=app'))).toBe(true);
});

test('late quote cannot restore an old amount and gift choice is saved',async({page})=>{
 const s=await setup(page);
 let release: (()=>Promise<void>) | undefined;
 await page.route('**/manual/quote',async r=>{
  const body=r.request().postDataJSON();
  if (body.items[0].quantity===1) {release=()=>r.fulfill({json:{items:[],total_amount:3200}});return;}
  await r.fulfill({json:{items:[],total_amount:12800,gift_choices:[{id:'waffle',title:'Вафля'},{id:'cotton',title:'Сладкая вата'}],gift_required:!body.selected_gift_id}});
 });
 await page.goto('/partner/dam-alem?section=orders');await page.getByRole('button',{name:'Новый заказ',exact:true}).click();
 const m=page.getByRole('dialog');await m.getByLabel('Получение').selectOption('dine_in');await m.getByRole('button',{name:/Пепперони/}).click();
 await expect.poll(()=>!!release).toBe(true);
 await m.getByLabel('Количество Пепперони',{exact:true}).fill('4');
 await expect(m.getByLabel('Подарок клиенту')).toBeVisible();await expect(m.getByRole('button',{name:/Создать заказ/})).toBeDisabled();
 await release!();await expect(m.getByRole('button',{name:/Создать заказ — 12.*800/})).toBeDisabled();
 await m.getByLabel('Подарок клиенту').selectOption('waffle');await expect(m.getByRole('button',{name:/Создать заказ — 12.*800/})).toBeEnabled();
 await m.getByRole('button',{name:/Создать заказ — 12.*800/}).click();await expect(m).toHaveCount(0);expect(s.payload.selected_gift_id).toBe('waffle');expect(s.writes).toBe(1);
});

test('gift selector shows the remaining available dessert after recalculation',async({page})=>{
 await setup(page);let onlyCotton=false;
 await page.route('**/manual/quote',async r=>{
  const body=r.request().postDataJSON();
  await r.fulfill({json:{items:[],total_amount:body.items[0].quantity*3200,gift_choices:onlyCotton?[{id:'cotton',title:'Сладкая вата'}]:[{id:'waffle',title:'Вафля'},{id:'cotton',title:'Сладкая вата'}],gift_required:!onlyCotton&&!body.selected_gift_id}});
 });
 await page.goto('/partner/dam-alem?section=orders');await page.getByRole('button',{name:'Новый заказ',exact:true}).click();
 const m=page.getByRole('dialog');await m.getByLabel('Получение').selectOption('dine_in');await m.getByRole('button',{name:/Пепперони/}).click();
 await m.getByLabel('Количество Пепперони',{exact:true}).fill('4');await m.getByLabel('Подарок клиенту').selectOption('waffle');
 await expect(m.getByRole('button',{name:/Создать заказ — 12.*800/})).toBeEnabled();
 onlyCotton=true;await m.getByLabel('Количество Пепперони',{exact:true}).fill('5');
 await expect(m.getByLabel('Подарок клиенту')).toHaveValue('cotton');await expect(m.getByRole('button',{name:/Создать заказ — 16.*000/})).toBeEnabled();
});

test('legacy delivery wording does not expose pickup completion to operator',async({page})=>{
 await setup(page);
 await page.route('**/operations/orders/92',r=>r.fulfill({json:{order:{id:92,status:'ready',delivery_method:'доставка',delivery_address:'Абая, 10',order_items:'[]',total_amount:1000,order_source:'app'},events:[]}}));
 await page.goto('/partner/dam-alem?section=orders&order=92');
 const detail=page.getByRole('region',{name:'Карточка заказа',exact:true});
 await expect(detail.getByText('Абая, 10',{exact:true})).toBeVisible();await expect(detail.getByRole('button',{name:'Выдан клиенту'})).toHaveCount(0);
 await expect(detail.getByRole('button',{name:'В доставке'})).toHaveCount(0);await expect(detail).toContainText('Приложение');
});
