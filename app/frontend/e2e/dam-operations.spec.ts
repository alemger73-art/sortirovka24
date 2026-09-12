import {test,expect,type Page} from '@playwright/test';
async function setup(page:Page){
 const order={id:71,version:0,status:'new',customer_name:'Тестовый клиент',customer_phone:'+77000000000',delivery_method:'pickup',delivery_address:'',order_items:JSON.stringify([{name:'Тестовое блюдо',quantity:2,price:1000}]),total_amount:2000,payment_method:'cash',payment_status:'pending',comment:'Без лука',created_at:'2026-09-13T10:00:00Z',operator_note:'',cancellation_reason:''};
 const state={order,writes:0,settings:{enabled:false,chat_id:'',has_token:false,status_updates:true},query:'',fail:false,conflict:false};
 await page.addInitScript(()=>{localStorage.setItem('_partner_token_dam_alem','test-partner');localStorage.setItem('_dam_alem_partner_token','test-partner');localStorage.setItem('token','test-partner');});
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.route('**/api/**',async r=>{const u=new URL(r.request().url()),p=u.pathname,m=r.request().method();let json:unknown={items:[],total:0};
 if(p.endsWith('/business/me'))json={role:'owner',name:'Тестовый владелец'};
 if(p.includes('verify-session'))json={valid:true,display_name:'Тестовый оператор',login:'test'};
 if(p.endsWith('/operations/orders')){state.query=u.search;if(state.fail){await r.fulfill({status:503,json:{detail:'Нет связи с сервером'}});return;}json={items:u.searchParams.get('q')==='несуществующий'?[]:[state.order],total:u.searchParams.get('q')==='несуществующий'?0:1};}
 if(p.endsWith('/operations/orders/71')){if(m==='PATCH'){state.writes++;if(state.conflict){await r.fulfill({status:409,json:{detail:'Заказ уже изменён другим оператором. Обновите карточку.'}});return;}Object.assign(state.order,r.request().postDataJSON());state.order.version++;json=state.order;}else json={order:state.order,events:[{id:1,actor:'Система',message:'Заказ создан',created_at:order.created_at,notification:'pending',error:null}]};}
 if(p.endsWith('/operations/telegram')){if(m==='PUT'){const b=r.request().postDataJSON();state.settings={enabled:b.enabled,chat_id:b.chat_id,has_token:true,status_updates:b.status_updates};state.writes++;}json=state.settings;}
 if(p.endsWith('/telegram/test'))json={ok:true,chat:'Тестовый канал'};
 await r.fulfill({json});});return state;
}
test('operator pickup lifecycle, payment and responsive layout',async({page},info)=>{const s=await setup(page);await page.goto('/partner/dam-alem?section=orders&order=71');await expect(page.getByRole('heading',{name:'Заказ №71',exact:true})).toBeVisible();await expect(page.getByText('Тестовое блюдо × 2')).toBeVisible();await page.getByRole('button',{name:'Принят',exact:true}).click();await page.getByRole('button',{name:'Готовится',exact:true}).click();await page.getByRole('button',{name:'Готов к выдаче',exact:true}).click();await expect(page.getByRole('button',{name:'В доставке',exact:true})).toHaveCount(0);await page.getByRole('button',{name:'Подтвердить получение оплаты'}).click();await page.getByRole('button',{name:'Выдан клиенту'}).click();expect(s.order.status).toBe('done');expect(s.order.payment_status).toBe('paid');expect(s.writes).toBe(5);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:info.outputPath('orders.png'),fullPage:true});});
test('search and conflict never show false success',async({page})=>{const s=await setup(page);await page.goto('/partner/dam-alem?section=orders&order=71');await page.getByLabel('Поиск заказов').fill('несуществующий');await expect(page.getByText('По выбранному фильтру заказов нет.')).toBeVisible();expect(s.query).toContain('q=');s.conflict=true;await page.getByRole('button',{name:'Принят',exact:true}).click();await expect(page.getByText('Заказ уже изменён другим оператором. Обновите карточку.')).toBeVisible();expect(s.order.status).toBe('new');expect(s.writes).toBe(1);});
test('cancellation requires reason and settings hide token after save',async({page})=>{const s=await setup(page);await page.goto('/partner/dam-alem?section=orders&order=71');await page.getByRole('button',{name:'Отменить заказ',exact:true}).click();await expect(page.getByRole('button',{name:'Подтвердить отмену'})).toBeDisabled();await page.getByLabel('Причина отмены',{exact:true}).fill('Клиент передумал');await page.getByRole('button',{name:'Подтвердить отмену'}).click();expect(s.order.cancellation_reason).toBe('Клиент передумал');await page.getByRole('navigation',{name:'Разделы кабинета'}).getByRole('button',{name:'Настройки',exact:true}).click();await page.getByRole('button',{name:'Telegram',exact:true}).click();await page.getByLabel('Токен бота',{exact:true}).fill('123456:fake-test-token');await page.getByLabel('Канал или группа',{exact:true}).fill('-100123456');await page.getByRole('button',{name:'Сохранить настройки',exact:true}).click();await expect(page.getByLabel('Токен бота',{exact:true})).toHaveValue('');await expect(page.getByRole('status')).toContainText('Настройки сохранены');expect(s.settings.enabled).toBe(false);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);});

test('late automatic refresh cannot overwrite an operator draft or its version',async({page})=>{
 const s=await setup(page);await page.clock.install();
 let reads=0;let release:(()=>Promise<void>)|undefined;
 await page.route('**/operations/orders/71',async r=>{
  if(r.request().method()!=='GET'){await r.fallback();return;}
  reads++;
  if(reads===2){release=async()=>{await r.fulfill({json:{order:{...s.order,version:9,operator_note:'Чужая заметка'},events:[]}});};return;}
  await r.fallback();
 });
 await page.goto('/partner/dam-alem?section=orders&order=71');
 await expect(page.getByRole('heading',{name:'Заказ №71',exact:true})).toBeVisible();
 await page.clock.fastForward(15001);await expect.poll(()=>!!release).toBe(true);
 await page.getByRole('button',{name:'Заметка',exact:true}).click();
 await page.getByLabel('Заметка для сотрудников',{exact:true}).fill('Черновик оператора');
 await release!();await expect(page.getByLabel('Заметка для сотрудников',{exact:true})).toHaveValue('Черновик оператора');
 await expect(page.getByRole('button',{name:'Обновить карточку'})).toBeDisabled();
 const request=page.waitForRequest(r=>r.url().endsWith('/orders/71')&&r.method()==='PATCH');
 await page.getByRole('button',{name:'Сохранить изменения',exact:true}).click();
 expect((await request).postDataJSON().expected_version).toBe(0);
});
