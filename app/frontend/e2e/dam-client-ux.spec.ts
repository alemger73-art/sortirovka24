import {test,expect} from '@playwright/test';

test('client pickup excludes dine-in and delivery upsells and explains unavailable items', async ({page,request}) => {
  const sessions = await (await request.get('/__test__/sessions')).json();
  const headers = {Authorization:`Bearer ${sessions.operator}`};
  await request.patch('/api/v1/dam-alem/business/availability/4',{headers,data:{available:true}});
  await page.addInitScript(() => {localStorage.setItem('app_lang','ru');sessionStorage.setItem('s24_welcome_done','1');});
  await page.goto('/food');
  await page.getByRole('button',{name:'Пепперони',exact:true}).click();
  await page.getByRole('button',{name:/Добавить в корзину/}).click();
  await page.getByRole('button',{name:/^(Корзина 1|1 Корзина)$/}).click();
  await page.getByRole('button',{name:'Самовывоз',exact:true}).click();
  await expect(page.getByRole('button',{name:'На месте',exact:true})).toHaveCount(0);
  await expect(page.getByText(/Ещё.*доставк/)).toHaveCount(0);
  await page.getByRole('button',{name:/Оформить ·/}).click();
  await expect(page.getByRole('button',{name:'На месте',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Закрыть оформление',exact:true}).click();
  const stopped = await request.patch('/api/v1/dam-alem/business/availability/4',{headers,data:{available:false}});
  expect(stopped.ok()).toBe(true);
  // The active storefront refreshes its catalog on focus.
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('alert').filter({hasText:'Пепперони'})).toBeVisible({timeout:40000});
  await expect(page.getByText('Корзина пуста',{exact:true})).toBeVisible();
  await request.patch('/api/v1/dam-alem/business/availability/4',{headers,data:{available:true}});
});

