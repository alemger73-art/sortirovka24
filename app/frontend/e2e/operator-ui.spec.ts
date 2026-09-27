import {test,expect,type Page} from '@playwright/test';

async function setup(page:Page) {
 const state={items:[
  {id:1,name:'4 сезона',available:true,category_id:1,category_name:'Пицца'},
  {id:2,name:'Coca-Cola',available:false,category_id:2,category_name:'Напитки'},
  {id:3,name:'Очень длинное название пиццы с сыром и грибами',available:true,category_id:1,category_name:'Пицца'},
 ],orders:[] as {id:number;status:string}[],fail:false,writes:0,reads:0};
 await page.addInitScript(()=>{
  localStorage.setItem('app_lang','ru');localStorage.setItem('dam_operator_workstation','device');
  sessionStorage.setItem('dam_workstation_session','operator');sessionStorage.setItem('s24_welcome_done','1');
  // Count sound events without relying on OS audio/autoplay in headless Chrome.
  (window as any).soundNotes=0;
  (window as any).AudioContext=class {
   state='running';currentTime=0;destination={};
   createOscillator(){return {type:'',frequency:{setValueAtTime(){}},connect(){},start(){(window as any).soundNotes++;},stop(){}};}
   createGain(){return {gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){}};}
  };
 });
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.route('**/api/**',async r=>{
  const url=new URL(r.request().url()),p=url.pathname;let json:any={items:[],total:0};
  if(p.endsWith('/modules'))json={food:true,dam_alem:true};
  if(p.endsWith('/shifts/me'))json={staff:{id:1,name:'Айжан',role:'operator',pin_set:true},shift:{id:9,staff_name:'Айжан',role:'operator',active:true,opened_at:new Date().toISOString()}};
  if(p.endsWith('/business/me'))json={role:'operator',name:'Айжан'};
  if(p.endsWith('/business/availability')){state.reads++;json=state.items;}
  if(/\/availability\/\d+$/.test(p)){
   state.writes++;
   if(state.fail)return r.fulfill({status:409,json:{detail:'Смена закрыта. Откройте смену.'}});
   const item=state.items.find(i=>i.id===Number(p.split('/').pop()))!;
   const body=r.request().postDataJSON();expect(Object.keys(body)).toEqual(['available']);
   item.available=body.available;json={ok:true};
  }
  if(p.endsWith('/operations/orders'))json=url.searchParams.get('status')==='preorders'?{items:[],total:0}:{items:state.orders,total:state.orders.length};
  if(p.endsWith('/operations/order-counts'))json={new:state.orders.length,all:state.orders.length};
  await r.fulfill({json});
 });
 return state;
}

test('compact stop list: search, categories, counters and confirmed writes',async({page},info)=>{
 const state=await setup(page);
 await page.goto('/partner/dam-alem/operator?section=availability');
 const list=page.getByTestId('availability-list');
 await expect(list.locator('article').first()).toContainText('Coca-Cola');
 const filters=page.getByRole('group',{name:'Наличие блюд'});
 await expect(filters.getByRole('button',{name:'Все 3',exact:true})).toBeVisible();
 await page.getByTestId('availability-1').getByRole('button',{name:'В стоп',exact:true}).click();
 await expect(page.getByTestId('availability-1').getByText('Стоп',{exact:true})).toBeVisible();
 expect(state.items[0].available).toBe(false);
 await expect(filters.getByRole('button',{name:'Стоп 2',exact:true})).toBeVisible();
 await page.getByTestId('availability-1').getByRole('button',{name:'Вернуть',exact:true}).click();
 await expect(page.getByTestId('availability-1').getByText('В наличии',{exact:true})).toBeVisible();
 await filters.getByRole('button',{name:'Стоп 1',exact:true}).click();await expect(list.locator('article')).toHaveCount(1);
 await filters.getByRole('button',{name:'Все 3',exact:true}).click();
 await page.getByLabel('Категория блюда',{exact:true}).selectOption('1');await expect(list.locator('article')).toHaveCount(2);
 await page.getByLabel('Найти блюдо',{exact:true}).fill('4 СЕЗ');await expect(list.locator('article')).toHaveCount(1);
 await page.getByLabel('Найти блюдо',{exact:true}).fill('Нет блюда');await expect(page.getByText('По выбранным фильтрам блюд нет')).toBeVisible();
 await page.getByLabel('Найти блюдо',{exact:true}).fill('');await page.getByLabel('Категория блюда',{exact:true}).selectOption('');
 await expect(page.getByRole('button',{name:/Создать блюдо|Удалить блюдо|Изменить цену/})).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 const columns=await list.evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length);
 expect(columns).toBe((page.viewportSize()?.width||0)>=1024?2:1);
 await page.screenshot({path:info.outputPath('stop-list.png'),fullPage:true});
 await page.reload();await expect(page.getByTestId('availability-1').getByText('В наличии',{exact:true})).toBeVisible();
});

test('failed write preserves state; polling updates data without losing filters',async({page})=>{
 const state=await setup(page);await page.clock.install();
 await page.goto('/partner/dam-alem/operator?section=availability');
 const row=page.getByTestId('availability-1');await expect(row).toBeVisible();
 state.fail=true;await row.getByRole('button',{name:'В стоп',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('Смена закрыта');
 await expect(row.getByText('В наличии',{exact:true})).toBeVisible();expect(state.items[0].available).toBe(true);
 await page.getByLabel('Найти блюдо').fill('4 сезона');await page.getByLabel('Категория блюда').selectOption('1');
 state.fail=false;state.items[0].available=false;const oldReads=state.reads;
 await page.clock.runFor(15000);await expect.poll(()=>state.reads).toBeGreaterThan(oldReads);
 await expect(row.getByText('Стоп',{exact:true})).toBeVisible();
 await expect(page.getByLabel('Найти блюдо')).toHaveValue('4 сезона');await expect(page.getByLabel('Категория блюда')).toHaveValue('1');
});

test('zero, one and many arrivals: one toolbar, finite toast and no repeated sound',async({page},info)=>{
 const state=await setup(page);await page.clock.install();
 await page.goto('/partner/dam-alem/operator?section=availability');await expect(page.getByTestId('availability-1')).toBeVisible();
 const toolbar=page.getByTestId('new-orders-toolbar');await expect(toolbar).toHaveCount(0);
 state.orders=[{id:71,status:'new'}];await page.clock.runFor(5000);
 await expect(toolbar).toContainText('Ждут принятия: 1');
 await expect(page.locator('[data-sonner-toast]')).toHaveCount(1);
 await expect(page.locator('[data-sonner-toast]')).toContainText('Поступил заказ №71');
 expect(await page.evaluate(()=>(window as any).soundNotes)).toBe(3);
 await page.clock.runFor(10000);await expect(page.locator('[data-sonner-toast]')).toHaveCount(0);
 expect(await page.evaluate(()=>(window as any).soundNotes)).toBe(3);
 state.orders.push(...[72,73,74,75,76].map(id=>({id,status:'new'})));
 await page.clock.runFor(5000);await expect(toolbar).toContainText('Ждут принятия: 6');
 await expect(page.locator('[data-sonner-toast]')).toHaveCount(1);
 expect(await page.evaluate(()=>(window as any).soundNotes)).toBe(6);
 await page.clock.runFor(35000);await expect(page.locator('[data-sonner-toast]')).toHaveCount(0);
 expect(await page.evaluate(()=>(window as any).soundNotes)).toBe(6);
 expect((await toolbar.boundingBox())!.height).toBeLessThan(112);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.screenshot({path:info.outputPath('orders-toolbar.png'),fullPage:true});
 await toolbar.getByRole('button',{name:'Выключить звук'}).click();
 state.orders.push({id:77,status:'new'});await page.clock.runFor(5000);await expect(toolbar).toContainText('Ждут принятия: 7');
 expect(await page.evaluate(()=>(window as any).soundNotes)).toBe(6);
 await toolbar.getByRole('button',{name:'К заказам',exact:true}).click();await expect(page).toHaveURL(/section=orders.*status=new/);
 state.orders=[];await page.clock.runFor(5000);await expect(toolbar).toHaveCount(0);
});
