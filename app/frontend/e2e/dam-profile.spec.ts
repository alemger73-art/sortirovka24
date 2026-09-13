import {test,expect,type Page} from '@playwright/test';
async function setup(page:Page){
 const state={failRead:false,failWrite:0,writes:0,headers:[] as {path:string;auth:string|undefined;method:string}[],restaurant:{id:1,name:'DAM ALEM',photo:'',description:'Исходное описание',whatsapp_phone:'87470304096',working_hours:'10:00–22:00',delivery_time:'25–30',cuisine_type:'Пицца',min_order:3000,rating:5,is_active:true,sort_order:1}};
 await page.addInitScript(()=>{localStorage.setItem('_partner_token_dam_alem','partner-owner');localStorage.setItem('_sp924_token','expired-platform');localStorage.setItem('account_token','customer-session');localStorage.setItem('token','another-cabinet');});
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.routeWebSocket('**/ws/**',ws=>ws.close());
 await page.route('**/api/**',async r=>{const p=new URL(r.request().url()).pathname,m=r.request().method();const auth=r.request().headers().authorization;state.headers.push({path:p,auth,method:m});let json:unknown={items:[],total:0};
 if(p.includes('verify-session'))json={valid:true,display_name:'Тестовый владелец',username:'test'};
 if(p.endsWith('/business/me'))json={role:'owner',name:'Тест'};
 if(p.includes('/entities/food_restaurants')){
  if(m==='GET'){if(state.failRead)return r.fulfill({status:503,json:{detail:'Сервер временно недоступен'}});json={items:[state.restaurant],total:1};}
  else {state.writes++;if(state.failWrite)return r.fulfill({status:state.failWrite,json:{detail:state.failWrite===403?'Оператору доступны заказы и доступность блюд.':'Требуется авторизация администратора.'}});if(auth!=='Bearer partner-owner'&&auth!=='Bearer platform-valid')return r.fulfill({status:401,json:{detail:'Требуется авторизация администратора.'}});Object.assign(state.restaurant,r.request().postDataJSON());json=state.restaurant;}
 }
 if(p.includes('/entities/food_settings')&&m==='POST'){state.writes++;json={id:state.writes,...r.request().postDataJSON()};}
 await r.fulfill({json});});return state;
}
test('profile saves with the partner session despite other saved logins and survives reload',async({page})=>{
 const s=await setup(page);await page.goto('/partner/dam-alem?section=brand');
 await page.getByRole('textbox',{name:'Описание',exact:true}).fill('Новое описание доставки');
 await page.getByRole('button',{name:'Сохранить',exact:true}).click();
 await expect(page.getByText('Профиль DAM ALEM 2.0 сохранён',{exact:true})).toBeVisible();
 expect(s.restaurant.description).toBe('Новое описание доставки');expect(s.writes).toBe(1);
 expect(s.headers.filter(h=>h.path.includes('/entities/food_restaurants')).every(h=>h.auth==='Bearer partner-owner')).toBe(true);
 await page.reload();await expect(page.getByRole('textbox',{name:'Описание',exact:true})).toHaveValue('Новое описание доставки');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('save errors show the server reason and preserve the draft',async({page})=>{
 const s=await setup(page);await page.goto('/partner/dam-alem?section=brand');await page.getByRole('textbox',{name:'Описание',exact:true}).fill('Не потерять черновик');
 s.failWrite=401;await page.getByRole('button',{name:'Сохранить',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Сессия кабинета истекла');
 await expect(page.getByRole('textbox',{name:'Описание',exact:true})).toHaveValue('Не потерять черновик');
 s.failWrite=403;await page.getByRole('button',{name:'Сохранить',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Оператору доступны');
 s.failWrite=0;await page.getByRole('button',{name:'Сохранить',exact:true}).click();await expect(page.getByText('Профиль DAM ALEM 2.0 сохранён',{exact:true})).toBeVisible();
});
test('failed profile read cannot create a duplicate restaurant',async({page})=>{
 const s=await setup(page);s.failRead=true;await page.goto('/partner/dam-alem?section=brand');await expect(page.getByRole('alert')).toContainText('Не удалось загрузить профиль');
 await expect(page.getByRole('button',{name:'Сохранить',exact:true})).toHaveCount(0);expect(s.writes).toBe(0);
 s.failRead=false;await page.getByRole('button',{name:'Повторить загрузку'}).click();await expect(page.getByRole('textbox',{name:'Название',exact:true})).toHaveValue('DAM ALEM');
});
test('SDK settings requests use the same partner identity',async({page})=>{
 const s=await setup(page);await page.goto('/partner/dam-alem?section=settings');
 await expect(page.getByRole('button',{name:'Сохранить всё',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Сохранить всё',exact:true}).click();
 await expect.poll(()=>s.writes).toBeGreaterThan(0);
 expect(s.headers.filter(h=>h.path.includes('/entities/food_settings')).every(h=>h.auth==='Bearer partner-owner')).toBe(true);
});
test('platform administration retains its own identity',async({page})=>{
 const s=await setup(page);await page.addInitScript(()=>localStorage.setItem('_sp924_token','platform-valid'));
 await page.goto('/admin?tab=dam-alem&section=brand');await page.getByRole('textbox',{name:'Описание',exact:true}).fill('Из общей админки');await page.getByRole('button',{name:'Сохранить',exact:true}).click();
 await expect(page.getByText('Профиль DAM ALEM 2.0 сохранён',{exact:true})).toBeVisible();
 expect(s.headers.filter(h=>h.path.includes('/entities/food_restaurants')).every(h=>h.auth==='Bearer platform-valid')).toBe(true);
});
