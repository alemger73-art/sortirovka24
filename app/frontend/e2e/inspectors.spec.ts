import {test,expect,type Page} from '@playwright/test';
import {findInspector,matchesHouse,normalizeStreet,phoneDigits,phoneHref,safeHttps,emptyDirectory,type Inspector} from '../src/lib/inspectorDirectory';
const people:Inspector[]=[{id:1,full_name:'Тестовый инспектор Иванов',position:'Участковый инспектор',precinct_number:'1',photo_url:'http://127.0.0.1:3174/icon-512.png',phone:'+7 (701) 111-22-33',whatsapp:'8 701 111 22 33',address:'Тестовая улица, 2',schedule:'Вторник, 15:00–18:00',streets:'Абая',coverage:JSON.stringify([{street:'Абая',houses:'2–40 (четные)'},{street:'Улытау',houses:'Все дома'}])},{id:2,full_name:'Тестовый инспектор Петров',precinct_number:'2',photo_url:'http://127.0.0.1:3174/icon-512.png',streets:'Абая',coverage:JSON.stringify([{street:'Абая',houses:'1–39 (нечетные)'}])},{id:3,full_name:'Тестовый начальник отдела',position:'Начальник отдела полиции',is_leadership:true,leadership_order:0,photo_url:'http://127.0.0.1:3174/icon-512.png',phone:'+77015556677'}];
async function setup(page:Page){
 const state={directory:{...emptyDirectory,department_name:'Тестовый отдел полиции',address:'Тестовая площадь, 1',duty_phone:'+7 7212 11 22 33',map_url:'https://example.org/map',revision:1,tips:[{title:'Статья 505: благоустройство',body:'Тестовая справочная памятка. Сведения проверяются по закону.',source_url:'https://adilet.zan.kz/rus/docs/K1400000235'}]},people:people.map(p=>({...p})),peopleWrites:0,writes:0,failSave:false,failRead:false};
 await page.addInitScript(()=>{localStorage.setItem('app_lang','ru');localStorage.setItem('_sp924_token','test-admin');localStorage.setItem('token','test-admin');});
 await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'||route.request().url().includes('/api/')?route.continue():route.abort());
 await page.route('**/api/**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname;let json:unknown={items:[],total:0};
  if(path.includes('verify-session'))json={valid:true,username:'test'};
  if(path.endsWith('/inspector-directory')){
   if(req.method()==='PUT'){state.writes++;if(state.failSave){state.failSave=false;return route.fulfill({status:409,json:{detail:'Сведения уже изменены. Обновите страницу перед сохранением.'}});}state.directory={...req.postDataJSON(),revision:state.directory.revision+1};}
   json=state.directory;
  }
  if(path.includes('/entities/inspectors')){
   if(state.failRead)return route.fulfill({status:500,json:{detail:'Temporary failure'}});
   if(req.method()==='PUT'){state.peopleWrites++;const raw=req.postDataJSON();const patch=raw.data||raw;const id=Number(path.split('/').pop());const ins=state.people.find(i=>i.id===id)!;Object.assign(ins,patch);json=ins;}
   else if(req.method()==='POST'){state.peopleWrites++;json={id:100,...req.postDataJSON()};}
   else json={items:state.people,total:state.people.length};
  }
  if(path.includes('/storage/'))json={download_url:'http://127.0.0.1:3174/icon-512.png'};
  await route.fulfill({json});
 });return state;
}
test('address rules never guess an inspector',()=>{
 expect(normalizeStreet('ул. Абая')).toBe('абая');expect(normalizeStreet('Улытау')).toBe('улытау');expect(normalizeStreet('Дружбы')).toBe('дружбы');
 expect(findInspector(people[0],'Абая','12')).toBe('confirmed');expect(findInspector(people[1],'Абая','12')).toBe(false);
 expect(findInspector(people[0],'Аба','12')).toBe('possible');expect(findInspector(people[0],'Абая','12А')).toBe(false);
 expect(matchesHouse('1, 12а, 12/1','12А')).toBe(true);expect(matchesHouse('уточняется','12')).toBe(null);
 expect(phoneDigits('8 (701) 111-22-33')).toBe('77011112233');expect(phoneHref('1234567')).toBe('tel:1234567');expect(safeHttps('javascript:alert(1)')).toBe('');
});
test('search, full address details, contacts and responsive layout',async({page},info)=>{
 await setup(page);await page.goto('/inspectors');
 await expect(page.getByRole('heading',{name:'Участковые инспекторы',exact:true})).toBeVisible();
 await page.getByLabel('Улица',{exact:true}).fill('Абая');await page.getByLabel('Дом',{exact:true}).fill('12');
 await expect(page.locator('.police-person').filter({hasText:'Тестовый инспектор Иванов'})).toHaveCount(1);
 await expect(page.locator('.police-person').filter({hasText:'Тестовый инспектор Петров'})).toHaveCount(0);
 const card=page.locator('.police-person').filter({hasText:'Тестовый инспектор Иванов'});
 await card.locator('summary').click();await expect(card.getByText('2–40 (четные)')).toBeVisible();
 await expect(card.getByRole('link',{name:/WhatsApp/})).toHaveAttribute('href','https://wa.me/77011112233');
 await expect(card.getByRole('link',{name:/Позвонить/})).toHaveAttribute('href','tel:+77011112233');
 await page.reload();await expect(page.getByLabel('Дом',{exact:true})).toHaveValue('12');
 await page.getByLabel('Дом',{exact:true}).fill('99');await expect(page.getByRole('heading',{name:'Адрес пока не найден'})).toBeVisible();
 await page.getByRole('button',{name:'Сбросить'}).click();
 await expect(page.locator('.police-person')).toHaveCount(3);
 await page.getByText('Статья 505: благоустройство',{exact:true}).click();await expect(page.getByText('Тестовая справочная памятка.',{exact:false})).toBeVisible();
 await page.evaluate(()=>{(document.activeElement as HTMLElement)?.blur();window.scrollTo(0,0);});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await page.screenshot({path:info.outputPath('inspectors.png'),fullPage:true});
});
test('empty directory offers no invented contacts',async({page})=>{
 const state=await setup(page);state.people=[];state.directory={...state.directory,department_name:'',address:'',duty_phone:'',map_url:''};
 await page.goto('/inspectors');await expect(page.getByRole('heading',{name:'Карточки инспекторов готовятся'})).toBeVisible();
 await expect(page.getByRole('link',{name:'102 · Полиция'})).toHaveAttribute('href','tel:102');
 await expect(page.locator('a[href^="https://wa.me/"]')).toHaveCount(0);
});
test('admin department changes survive reload and report conflict',async({page})=>{
 const state=await setup(page);await page.goto('/admin?tab=inspectors');
 await page.getByLabel('Название отдела',{exact:true}).fill('Обновлённый тестовый отдел');state.failSave=true;
 await page.getByRole('button',{name:'Сохранить сведения об отделе',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('Сведения уже изменены');expect(state.writes).toBe(1);
 await page.getByRole('button',{name:'Сохранить сведения об отделе',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('Сведения сохранены');expect(state.writes).toBe(2);
 await page.reload();await expect(page.getByLabel('Название отдела',{exact:true})).toHaveValue('Обновлённый тестовый отдел');
 await page.goto('/inspectors');await expect(page.getByRole('heading',{name:'Обновлённый тестовый отдел'})).toBeVisible();
});

test('inspector address editing preserves an unsaved department draft',async({page})=>{
 const state=await setup(page);await page.goto('/admin?tab=inspectors');
 await page.getByLabel('Название отдела',{exact:true}).fill('Несохранённый черновик отдела');
 await page.getByRole('button',{name:'Редактировать Тестовый инспектор Иванов',exact:true}).click();
 const dialog=page.getByRole('dialog');
 await dialog.getByLabel('Закреплённые дома',{exact:true}).first().fill('2–60 (четные)');
 await dialog.getByRole('button',{name:'Сохранить',exact:true}).click();
 await expect(dialog).toHaveCount(0);expect(state.peopleWrites).toBe(1);
 await expect(page.getByLabel('Название отдела',{exact:true})).toHaveValue('Несохранённый черновик отдела');
 await page.goto('/inspectors?street=Абая&house=60');
 await expect(page.getByText('Дом указан в закреплённых адресах')).toBeVisible();
 await expect(page.locator('.police-person').filter({hasText:'Тестовый инспектор Иванов'})).toHaveCount(1);
});
test('new inspector cannot be saved without a photograph',async({page})=>{
 const state=await setup(page);await page.goto('/admin?tab=inspectors');
 await page.getByRole('button',{name:'Добавить',exact:true}).click();
 const dialog=page.getByRole('dialog');await dialog.locator('input').first().fill('Тестовый новый инспектор');
 await dialog.getByRole('button',{name:'Создать',exact:true}).click();
 await expect(page.getByText('Укажите ФИО, фотографию и закреплённые улицы. Для руководства улицы не обязательны.',{exact:true})).toBeVisible();
 expect(state.peopleWrites).toBe(0);
});
test('small native screen and large text do not overflow',async({page},info)=>{
 await setup(page);await page.setViewportSize({width:320,height:740});
 await page.addInitScript(()=>document.addEventListener('DOMContentLoaded',()=>{document.documentElement.style.fontSize='18px';document.documentElement.classList.add('native-app');}));
 await page.goto('/inspectors');await expect(page.getByRole('heading',{name:'Участковые инспекторы',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await page.screenshot({path:info.outputPath('inspectors-native-320.png'),fullPage:true});
});
