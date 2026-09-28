import {test,expect,type Page} from '@playwright/test';

async function login(page:Page,token:string,role='owner') {
  await page.addInitScript(({token,role})=>{
    localStorage.setItem('app_lang','ru');sessionStorage.setItem('s24_welcome_done','1');
    if(role==='client'){localStorage.setItem('account_token',token);localStorage.setItem('s24_account_token_v1',token);}
    else {localStorage.setItem('_partner_token_dam_alem',token);localStorage.setItem('_dam_alem_partner_token',token);}
  },{token,role});
}

test('owner configures universal modifiers; customer order reaches operator, kitchen and immutable receipt; combo fixed and choice',async({page,browser,request},info)=>{
  page.setDefaultTimeout(20000);
  const sessions=await(await request.get('/__test__/sessions')).json();
  const operatorHeaders={Authorization:`Bearer ${sessions.operator}`};
  const suffix=info.project.name;
  await login(page,sessions.owner);await page.goto('/partner/dam-alem?section=modifiers');
  await page.getByRole('button',{name:'+ Создать группу добавок',exact:true}).click();
  let editor=page.getByRole('dialog');
  await editor.getByLabel('Название группы',{exact:true}).fill(`Соусы ${suffix}`);
  await editor.getByLabel('Разрешить количество одной добавки').check();
  for(const name of ['Сырный','Барбекю','Чесночный']){
    await editor.getByRole('button',{name:'+ Добавить вариант',exact:true}).click();
    await editor.getByLabel('Название варианта',{exact:true}).last().fill(name);
    await editor.getByLabel('Цена, ₸',{exact:true}).last().fill('300');
  }
  await editor.getByRole('button',{name:'Сохранить',exact:true}).click();await expect(editor).toHaveCount(0);
  await page.goto('/partner/dam-alem?section=menu');
  await page.locator('article').filter({has:page.getByRole('heading',{name:'Пепперони',exact:true})}).getByRole('button',{name:'Изменить',exact:true}).click();
  editor=page.getByRole('dialog');await editor.getByLabel('Разрешить добавки',{exact:true}).check();
  // Each viewport reuses the local database; keep exactly one shared group.
  for(const check of await editor.locator('input[type=checkbox]').all()){
    const label=await check.locator('..').innerText();if(label.startsWith('Соусы ')&&label!==`Соусы ${suffix}`)await check.uncheck();
  }
  await editor.getByLabel(`Соусы ${suffix}`,{exact:true}).check();
  await editor.getByRole('button',{name:'Сохранить',exact:true}).click();await expect(editor).toHaveCount(0);
  await page.reload();await expect(page.locator('article').filter({has:page.getByRole('heading',{name:'Пепперони',exact:true})})).toContainText(`Добавки: Соусы ${suffix}`);
  const catalog=await(await request.get('/api/v1/dam-alem/menu/catalog')).json();const group=catalog.groups.find((g:{name:string})=>g.name===`Соусы ${suffix}`);
  const customerContext=await browser.newContext({viewport:info.project.use.viewport,serviceWorkers:'block'}),customer=await customerContext.newPage();
  await login(customer,sessions.client,'client');await customer.goto('/food');
  // Product title itself is also an accessible entry to its selection sheet.
  await customer.getByText('Пепперони',{exact:true}).first().click();
  const sheet=customer.getByRole('dialog');await expect(sheet).toContainText(`Соусы ${suffix}`);
  await sheet.getByLabel('Сырный',{exact:true}).check();
  await expect(sheet.getByRole('button',{name:/Добавить в корзину.*3.500/})).toBeEnabled();
  await sheet.getByRole('button',{name:/Добавить в корзину.*3.500/}).click();
  await customer.getByRole('button',{name:/Корзина/}).first().click();
  await customer.getByRole('button',{name:'Изменить состав',exact:true}).click();
  await customer.getByRole('dialog').getByRole('button',{name:'Увеличить Сырный'}).click();
  await customer.getByRole('dialog').getByRole('button',{name:/Сохранить изменения.*3.800/}).click();
  await customer.reload();await customer.getByRole('button',{name:/Корзина/}).first().click();
  await customer.getByRole('button',{name:/Оформить/}).first().click();
  await customer.getByTestId('dam-checkout-overlay').getByText('Самовывоз',{exact:true}).click();
  await customer.getByTestId('dam-checkout-next').click();
  const inputs=customer.getByTestId('dam-checkout');
  await inputs.getByPlaceholder('Введите имя').fill('Тестовый клиент');
  await customer.getByTestId('dam-checkout-next').click();
  const created=customer.waitForResponse(r=>r.url().includes('/entities/food_orders')&&r.request().method()==='POST');
  await customer.getByTestId('dam-checkout-submit').click();
  const orderResponse=await created;expect(orderResponse.status()).toBe(201);const order=await orderResponse.json();
  const snapshot=JSON.parse(order.order_items);expect(snapshot[0].modifiers[0].quantity).toBe(2);expect(snapshot[0].modifiers[0].price).toBe(300);expect(order.total_amount).toBe(3800);
  const operatorContext=await browser.newContext({viewport:info.project.use.viewport,serviceWorkers:'block'});const operator=await operatorContext.newPage();await login(operator,sessions.operator,'operator');await operator.goto(`/partner/dam-alem?section=orders&order=${order.id}`);
  const card=operator.getByRole('region',{name:'Карточка заказа',exact:true});await expect(card).toContainText('Сырный ×2');
  await card.getByRole('button',{name:'Передать на кухню',exact:true}).click();await expect(card).toContainText('Готовится');
  await assertPrinted(operator,'Распечатать чек',['Пепперони','Сырный ×2','600']);
  await assertPrinted(operator,'Чек на кухню',['Пепперони','Сырный ×2','600']);
  await operator.screenshot({path:info.outputPath('operator-menu-order.png'),fullPage:true});
  await page.goto('/partner/dam-alem?section=modifiers');await page.locator('article').filter({hasText:`Соусы ${suffix}`}).getByRole('button',{name:'Изменить',exact:true}).click();
  editor=page.getByRole('dialog');await editor.getByLabel('Цена, ₸',{exact:true}).first().fill('450');await editor.getByRole('button',{name:'Сохранить',exact:true}).click();await expect(editor).toHaveCount(0);
  const saved=await(await request.get(`/api/v1/dam-alem/operations/orders/${order.id}`,{headers:operatorHeaders})).json();expect(JSON.parse(saved.order.order_items)).toEqual(snapshot);
  const fresh=await request.post('/api/v1/dam-alem/menu/line-quote',{data:{id:4,modifiers:[{option_id:group.options[0].id}],choices:[]}});expect((await fresh.json()).total).toBe(3650);
  await page.goto('/partner/dam-alem?section=combos');await page.getByRole('button',{name:'+ Создать комбо',exact:true}).click();editor=page.getByRole('dialog');
  await editor.getByLabel('Название',{exact:true}).fill(`COMBO ТЕСТ ${suffix}`);await editor.getByLabel('Фиксированная цена комбо, ₸').fill('7000');
  for(const name of ['Пепперони','Фри','Наггетсы']){await editor.getByRole('button',{name:'+ Добавить блюдо',exact:true}).click();await editor.getByLabel('Блюдо в составе').last().selectOption({label:name});}
  await editor.getByLabel('Разрешить добавки',{exact:true}).check();await editor.getByLabel(`Соусы ${suffix}`,{exact:true}).check();
  await editor.getByRole('button',{name:'Предпросмотр',exact:true}).click();await expect(page.getByRole('dialog').last()).toContainText('Наггетсы');await page.getByRole('dialog').last().getByRole('button',{name:/Закрыть предпросмотр/}).click();
  await editor.getByRole('button',{name:'Сохранить',exact:true}).click();await expect(editor).toHaveCount(0);
  await customer.goto('/food');await customer.getByText(`COMBO ТЕСТ ${suffix}`,{exact:true}).first().click();
  await expect(customer.getByRole('dialog')).toContainText('Пепперони ×1');await expect(customer.getByRole('dialog')).toContainText('Фри ×1');
  await customer.getByRole('dialog').getByLabel('Барбекю',{exact:true}).check();await expect(customer.getByRole('dialog').getByRole('button',{name:/Добавить в корзину.*7.300/})).toBeEnabled();
  await customer.screenshot({path:info.outputPath('combo-mobile.png'),fullPage:true});
  expect(await customer.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await customer.getByRole('dialog').getByRole('button',{name:/Добавить в корзину/}).click();
  const comboOrder=await submitPickup(customer);expect(comboOrder.total_amount).toBe(7300);
  expect(JSON.parse(comboOrder.order_items)[0].combo_components.map((x:{name:string})=>x.name)).toEqual(['Пепперони','Фри','Наггетсы']);
  await operator.goto(`/partner/dam-alem?section=orders&order=${comboOrder.id}`);
  await expect(card).toContainText('Наггетсы ×1');await expect(card).toContainText('Барбекю');
  await card.getByRole('button',{name:'Передать на кухню',exact:true}).click();await expect(card).toContainText('Готовится');
  await assertPrinted(operator,'Распечатать чек',['COMBO ТЕСТ','Пепперони ×1','Наггетсы ×1','Барбекю','7']);
  await assertPrinted(operator,'Чек на кухню',['COMBO ТЕСТ','Пепперони ×1','Фри ×1','Барбекю']);
  await page.goto('/partner/dam-alem?section=combos');await page.getByRole('button',{name:'+ Создать комбо',exact:true}).click();editor=page.getByRole('dialog');
  await editor.getByLabel('Название',{exact:true}).fill(`COMBO ВЫБОР ${suffix}`);await editor.getByLabel('Фиксированная цена комбо, ₸').fill('6000');
  await editor.getByRole('button',{name:'+ Группа выбора внутри комбо',exact:true}).click();await editor.getByLabel('Название группы выбора').fill('Выберите пиццу');
  for(const [name,price] of [['Пепперони','300'],['Наггетсы','0']]){await editor.getByRole('button',{name:'+ Вариант выбора',exact:true}).click();await editor.getByLabel('Блюдо в составе').last().selectOption({label:name});await editor.getByLabel('Доплата, ₸').last().fill(price);}
  await editor.getByLabel('Разрешить добавки',{exact:true}).check();await editor.getByLabel(`Соусы ${suffix}`,{exact:true}).check();await editor.getByRole('button',{name:'Сохранить',exact:true}).click();await expect(editor).toHaveCount(0);
  await customer.goto('/food');await customer.getByText(`COMBO ВЫБОР ${suffix}`,{exact:true}).first().click();
  await expect(customer.getByTestId('dam-product-add')).toBeDisabled();await customer.getByRole('dialog').getByLabel(/Пепперони/).check();await customer.getByRole('dialog').getByLabel('Барбекю',{exact:true}).check();
  await expect(customer.getByTestId('dam-product-add')).toContainText(/6.600/);await customer.getByTestId('dam-product-add').click();
  const choiceOrder=await submitPickup(customer);expect(choiceOrder.total_amount).toBe(6600);
  const choiceSnapshot=JSON.parse(choiceOrder.order_items)[0];expect(choiceSnapshot.choiceTotal).toBe(300);expect(choiceSnapshot.combo_components[0].name).toBe('Пепперони');
  await operator.goto(`/partner/dam-alem?section=orders&order=${choiceOrder.id}`);await expect(card).toContainText('Выберите пиццу: Пепперони');
  await assertPrinted(operator,'Распечатать чек',['Выберите пиццу: Пепперони','Барбекю']);
  // The operator uses the same live configuration and quote, without a second menu.
  await operator.getByRole('button',{name:'Новый заказ',exact:true}).click();
  const manual=operator.getByRole('dialog');
  await manual.getByLabel('Имя клиента').fill('Тестовый клиент');
  await manual.getByLabel('Телефон клиента').fill('+77000000000');
  await manual.getByRole('combobox',{name:'Получение',exact:true}).selectOption('pickup');
  await manual.getByRole('button',{name:new RegExp(`COMBO ВЫБОР ${suffix}`)}).click();
  await manual.getByLabel(/Пепперони/).check();await manual.getByLabel('Барбекю',{exact:true}).check();
  await expect(manual.getByRole('button',{name:/Создать заказ.*6.600/})).toBeEnabled();
  const manualResult=operator.waitForResponse(r=>r.url().endsWith('/operations/manual')&&r.request().method()==='POST');
  await manual.getByRole('button',{name:/Создать заказ.*6.600/}).click();
  const made=await manualResult;expect(made.status()).toBe(201);const operatorOrder=await made.json();
  expect(operatorOrder.order_source).toBe('operator');expect(operatorOrder.total_amount).toBe(6600);
  expect(JSON.parse(operatorOrder.order_items)[0].combo_components[0].name).toBe('Пепперони');
  await expect(manual).toHaveCount(0);await expect(card).toContainText('Барбекю');
  await customerContext.close();await operatorContext.close();
});

async function submitPickup(customer:Page){
 await customer.getByTestId('dam-cart-open').click();await customer.getByRole('button',{name:/Оформить/}).first().click();await customer.getByTestId('dam-checkout-overlay').getByText('Самовывоз',{exact:true}).click();await customer.getByTestId('dam-checkout-next').click();await customer.getByTestId('dam-checkout').getByPlaceholder('Введите имя').fill('Тестовый клиент');await customer.getByTestId('dam-checkout-next').click();const wait=customer.waitForResponse(r=>r.url().includes('/entities/food_orders')&&r.request().method()==='POST');await customer.getByTestId('dam-checkout-submit').click();const response=await wait;expect(response.status()).toBe(201);return response.json();
}
async function assertPrinted(page:Page,label:string,texts:string[]){
 await page.evaluate(()=>{document.querySelectorAll('iframe').forEach(f=>f.remove());const getter=Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype,'contentWindow')!.get!;Object.defineProperty(HTMLIFrameElement.prototype,'contentWindow',{configurable:true,get:function(this:HTMLIFrameElement){const win=getter.call(this);if(win)win.print=()=>{};return win;}});});
 await page.getByRole('button',{name:label,exact:true}).click();const body=page.frameLocator('iframe').locator('body');for(const text of texts)await expect(body).toContainText(text);
}
