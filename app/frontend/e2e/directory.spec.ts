import { test, expect, type Page } from '@playwright/test';
import { matchesEntry, phoneLink, whatsappLink, httpsLink, isLegacyDemo, emergencyContacts } from '../src/lib/directoryContent';
const contact = {id:1,entry_name:'Тестовая служба водоснабжения',category:'Коммунальные службы',phone:'+7 (7212) 11-22-33',address:'Тестовая улица, 12',description:'Заявки по водоснабжению.\nСведения для проверки интерфейса.',opening_hours:'Пн–Пт 09:00–18:00',source_url:'https://example.org/contact',verified_at:'2026-09-12',website:'https://example.org',map_url:'https://example.org/map',whatsapp:'+77011112233',is_published:true};
async function setup(page: Page) {
 const state={items:[{...contact},{...contact,id:2,category:'Новая категория',entry_name:'Тестовый центр документов'},{...contact,id:3,entry_name:'Скрытый черновик',is_published:false},{id:4,entry_name:'Пожарная служба',category:'Экстренные службы',phone:'104',is_published:true},{id:5,entry_name:'Городская поликлиника №3',category:'Здоровье',phone:'+77001234567',is_published:true}],writes:0,fail:false};
 await page.addInitScript(()=>{localStorage.setItem('app_lang','ru');localStorage.setItem('_sp924_token','test-admin');localStorage.setItem('token','test-admin');});
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.route('**/api/**',async r=>{
  const path=new URL(r.request().url()).pathname;let json:unknown={items:[],total:0};
  if(path.includes('verify-session'))json={valid:true,username:'test'};
  if(path.includes('/entities/directory_entries')){
   if(state.fail)return r.fulfill({status:500,json:{detail:'Test failure'}});
   if(r.request().method()==='POST'){state.writes++;const raw=r.request().postDataJSON();const added={id:99,...(raw.data||raw)};state.items.push(added);json=added;}
   else if(r.request().method()==='PUT'){state.writes++;const raw=r.request().postDataJSON();const entry=state.items.find(i=>String(i.id)===path.split('/').pop())!;Object.assign(entry,raw.data||raw);json=entry;}
   else json={items:state.items,total:state.items.length};
  }
  await r.fulfill({json});
 });return state;
}
test('search uses all words and telephone punctuation safely',()=>{
 expect(matchesEntry(contact,'служба водоснабжения')).toBe(true);expect(matchesEntry(contact,'служба электричества')).toBe(false);
 expect(matchesEntry(contact,'7212 11-22')).toBe(true);expect(phoneLink('8 (701) 111-22-33')).toBe('tel:+77011112233');expect(phoneLink('102, 103')).toBeUndefined();expect(whatsappLink('102')).toBeUndefined();expect(httpsLink('javascript:alert(1)')).toBeUndefined();expect(isLegacyDemo({...contact,entry_name:'Городская поликлиника №3',phone:'+77001234567',source_url:''})).toBe(true);expect(emergencyContacts.find(e=>e.number==='101')?.ru).toContain('Пожарные');
});
test('directory shows correct emergency numbers, all categories, and contact details',async({page},info)=>{
 await setup(page);await page.goto('/directory');await expect(page.getByRole('heading',{name:contact.entry_name})).toBeVisible();
 await expect(page.locator('.directory-emergency-grid a')).toHaveCount(5);await expect(page.locator('.directory-emergency-grid a[href="tel:101"]')).toContainText('Пожарные');await expect(page.locator('.directory-emergency-grid a[href="tel:104"]')).toContainText('газовая');
 await expect(page.getByRole('heading',{name:'Скрытый черновик'})).toHaveCount(0);await expect(page.getByRole('heading',{name:'Городская поликлиника №3'})).toHaveCount(0);await expect(page.getByRole('heading',{name:'Новая категория',exact:true})).toBeVisible();
 const card=page.locator('.directory-card').first();await expect(card.locator('a[href="tel:+77212112233"]')).toBeVisible();await expect(card.getByText('Пн–Пт 09:00–18:00')).toBeVisible();await expect(card.getByRole('link',{name:'Источник сведений'})).toHaveAttribute('href',contact.source_url);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:info.outputPath('directory.png'),fullPage:true});
});
test('search and category survive reload and can be cleared',async({page})=>{
 await setup(page);await page.goto('/directory');const search=page.getByRole('textbox',{name:'Поиск по справочнику'});await search.fill('служба водоснабжения');await expect(page.locator('.directory-card')).toHaveCount(1);await page.reload();await expect(search).toHaveValue('служба водоснабжения');await search.fill('служба электричества');await expect(page.getByRole('heading',{name:'Ничего не найдено'})).toBeVisible();await page.getByRole('button',{name:'Сбросить фильтры'}).click();await expect(page.locator('.directory-card')).toHaveCount(2);await page.getByRole('button',{name:'Новая категория · 1'}).click();await expect(page.locator('.directory-card')).toHaveCount(1);
});
test('empty directory keeps emergency calls and explains missing contacts',async({page})=>{
 const state=await setup(page);state.items=[];await page.goto('/directory');await expect(page.getByRole('heading',{name:'Местные контакты готовятся'})).toBeVisible();await expect(page.locator('a[href="tel:112"]')).toBeVisible();
});
test('admin saves draft then publishes with source and date',async({page})=>{
 const state=await setup(page);await page.goto('/admin?tab=directory');await page.getByRole('button',{name:'Добавить',exact:true}).click();await page.getByLabel('Название организации *',{exact:true}).fill('Новая тестовая организация');await page.getByRole('button',{name:'Сохранить черновик'}).click();await expect(page.getByRole('status')).toContainText('Черновик сохранён');expect(state.writes).toBe(1);
 await page.getByRole('button',{name:'Редактировать Новая тестовая организация'}).click();await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Сохранить и опубликовать'}).click();await expect(page.getByRole('alert')).toContainText('Для публикации');expect(state.writes).toBe(1);
 await page.getByLabel('Источник сведений',{exact:true}).fill('https://example.org/verified');await page.getByLabel('Дата проверки контактов',{exact:true}).fill('2026-09-12');await page.getByLabel('Телефон',{exact:true}).fill('+77011112233');await page.getByRole('button',{name:'Сохранить и опубликовать'}).click();await expect(page.getByRole('status')).toContainText('Запись сохранена');expect(state.writes).toBe(2);await page.goto('/directory');await expect(page.getByRole('heading',{name:'Новая тестовая организация'})).toBeVisible();
});
test('dark mode and larger text stay inside viewport',async({page},info)=>{
 await setup(page);await page.goto('/directory');await expect(page.locator('.directory-card').first()).toBeVisible();await page.evaluate(()=>{document.documentElement.classList.add('dark');document.documentElement.style.fontSize='20px';});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:info.outputPath('directory-dark.png'),fullPage:true});
});
