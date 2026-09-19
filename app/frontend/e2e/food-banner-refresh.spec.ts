import {test,expect} from '@playwright/test';
for(const theme of ['light','dark'])test(`compact banner and category strip ${theme}`,async({page},info)=>{
 await page.addInitScript(theme=>{localStorage.setItem('app_lang','ru');localStorage.setItem('sortirovka-theme',theme);sessionStorage.setItem('s24_welcome_done','1');},theme);
 await page.route('**/api/**',async r=>{
  const p=new URL(r.request().url()).pathname;let json:any={items:[],total:0};
  if(p.endsWith('/modules'))json={food:true};
  if(p.includes('food_restaurants'))json={items:[{id:1,name:'DAM ALEM 2.0'}]};
  if(p==='/api/categories')json={categories:[{id:1,name:'UFO Бургеры',slug:'ufo'},{id:2,name:'Пиццы',slug:'pizza-30'},{id:3,name:'Лимонады',slug:'limonady'}]};
  if(p==='/api/products')json={products:Array.from({length:12},(_,i)=>({id:i+1,category_id:i<4?1:i<8?2:3,title:`Блюдо ${i+1}`,price:2000,available:true}))};
  if(p.includes('food_settings'))json={items:Object.entries({promo_codes:JSON.stringify([{code:'TEST10',type:'percent',value:10,min_order:2500,max_discount:1500,label:'Неправильная подпись',active:true}]),loyalty_gifts:'[]',kitchen_open:'00:00',kitchen_close:'00:00'}).map(([setting_key,setting_value])=>({setting_key,setting_value}))};
  await r.fulfill({json});
 });
 await page.goto('/food');const banner=page.locator('.dam-market-offer--compact');await expect(banner).toBeVisible();
 expect((await banner.boundingBox())!.height).toBeLessThan(230);
 await expect(page.getByText('Неправильная подпись',{exact:true})).toHaveCount(0);
 await expect(page.getByText(/Скидка до 1.500/)).toBeVisible();
 await page.screenshot({path:info.outputPath(`banner-${theme}.png`)});
 await banner.click();const strip=page.locator('#dam-market-categories');await expect(strip).toBeInViewport();
 await strip.getByRole('button',{name:'Лимонады',exact:true}).click();
 await expect(strip.getByRole('button',{name:'Лимонады',exact:true})).toHaveAttribute('aria-current','true');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 if(theme==='dark')await expect(strip.locator('[aria-current="true"]')).toHaveCSS('background-color','rgb(247, 188, 139)');
 await page.screenshot({path:info.outputPath(`strip-${theme}.png`)});
});
