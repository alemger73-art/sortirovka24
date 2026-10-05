import { test, expect, type Page } from '@playwright/test';

const order = {
  id: 'food_42', type: 'food', order_number: 42, store_label: 'DAM ALEM 2.0', status: 'done', amount: 6350,
  delivery_method: 'delivery', payment_method: 'cash', paid_amount: 6350, cash_given_amount: 10000, change_amount: 3650,
  receipt: { subtotal: 6000, service_fee: 600, delivery_fee: 500, discount: 750 },
  order_items: JSON.stringify([
    { name: 'Комбо Орбита', price: 99999, quantity: 2, sum: 4400, combo_components: [{ name: 'UFO Бургер', quantity: 1 }], modifiers: [{ name: 'Сыр', price: 200 }] },
    { name: 'Пицца', quantity: 1, sum: 1600 },
    { name: 'Напиток в подарок', quantity: 1, sum: 0, is_gift: true },
  ]),
};

async function setup(page: Page, detail: unknown, lang = 'ru', status = 200) {
  const profile = { id: 'mine', name: 'Тест', phone: '+77001234567', role: 'user', has_password: true, language: lang };
  await page.addInitScript(({profile,lang}) => { localStorage.setItem('account_token', 'receipt-test'); localStorage.setItem('account_user_profile', JSON.stringify(profile)); localStorage.setItem('app_lang',lang); sessionStorage.setItem('s24_welcome_done','1'); }, {profile,lang});
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/account/orders/food/42')) return route.fulfill({status,json:detail});
    const body = path.endsWith('/account/me') ? profile : path.endsWith('/modules') ? {food:true} : {items:[],total:0};
    return route.fulfill({json:body});
  });
}

for (const lang of ['ru','kz']) test(`saved receipt keeps exact amounts and configured items (${lang})`, async ({page}, info) => {
  await setup(page,order,lang);
  await page.goto('/cabinet/orders/food/42');
  const receipt = page.getByRole('region',{name:lang === 'ru' ? 'Чек заказа' : 'Тапсырыс чегі'});
  await expect(receipt).toBeVisible();
  await expect(receipt).toContainText('UFO Бургер × 1');
  await expect(receipt).toContainText('Сыр');
  await expect(receipt).toContainText(lang === 'ru' ? 'Подарок' : 'Сыйлық');
  for (const amount of [4400,6000,6350,3650]) {
    const formatted = await page.evaluate(({amount,lang}) => amount.toLocaleString(lang === 'kz' ? 'kk-KZ' : 'ru-RU'), {amount,lang});
    await expect(receipt).toContainText(formatted);
  }
  await expect(receipt).not.toContainText(/99[\s,\u00a0]999/);
  await expect(receipt).toContainText(lang === 'ru' ? 'Сервисный сбор' : 'Қызмет ақысы');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({path:info.outputPath('customer-receipt.png'),fullPage:true});
});

test('legacy receipt does not invent fees or unknown prices', async ({page}) => {
  await setup(page,{...order,status:'cancelled',receipt:null,paid_amount:0,order_items:JSON.stringify([{name:'Старый заказ',quantity:1}])});
  await page.goto('/cabinet/orders/food/42');
  const receipt=page.getByRole('region',{name:'Чек заказа'});
  await expect(receipt).toContainText('подробный расчёт не сохранён');
  await expect(receipt).toContainText('Цена не сохранена');
  await expect(receipt).not.toContainText('Осталось оплатить');
});

test('denied order does not render a receipt', async ({page}) => {
  await setup(page,{detail:'Order not found'},'ru',404);
  await page.goto('/cabinet/orders/food/42');
  await expect(page.getByRole('region',{name:'Чек заказа'})).toHaveCount(0);
  await expect(page.getByText('Order not found',{exact:true})).toBeVisible();
});

test('history exposes exact before and after configured receipts', async ({page},info) => {
  const before = {items: JSON.parse(order.order_items), total_amount: 6350, receipt: order.receipt};
  const after = {items: [{name:'Новый напиток', quantity:1, sum:300}], total_amount:300, receipt:{subtotal:300,service_fee:0,delivery_fee:0,discount:0}};
  await setup(page,{...order, receipt_changes:[{kind:'receipt_changed',revision:1,actor_role:'operator',created_at:'2026-10-05T10:00:00Z',reason:'Клиент попросил заменить',before,after}]});
  await page.goto('/cabinet/orders/food/42');
  await page.getByText('История чеков и запросов (1)',{exact:true}).click();
  await page.getByText('Изменение чека №1',{exact:true}).click();
  await expect(page.getByText('До изменения',{exact:true})).toBeVisible();
  await expect(page.getByText('После изменения',{exact:true})).toBeVisible();
  await expect(page.getByText('UFO Бургер × 1',{exact:false})).toHaveCount(2);
  await expect(page.getByText('Новый напиток',{exact:true})).toBeVisible();
  await expect(page.getByText('Клиент попросил заменить',{exact:true})).toBeVisible();
  await page.screenshot({path:info.outputPath('receipt-history.png'),fullPage:true});
});

for (const mode of ['edit','request','conflict'] as const) test(`customer receipt editor ${mode}`, async ({page},info) => {
  let current:any={...order,status:mode==='request'?'confirmed':'new',version:0,food_order_id:42,paid_amount:0,can_edit_receipt:mode!=='request',can_request_receipt_change:true,
    order_items:JSON.stringify([{id:1,name:'Пицца',price:1000,quantity:1,sum:1000}]),amount:1000,receipt:{subtotal:1000,service_fee:0,delivery_fee:0,discount:0}};
  let submitted:any=null;
  await setup(page,current);
  await page.route('**/api/v1/account/orders/food/42**',async route=>{
    const path=new URL(route.request().url()).pathname;
    if(path.endsWith('/catalog')) return route.fulfill({json:{products:[{id:2,name:'Напиток',price:300,modifier_groups:[]}],groups:[],options:[],links:[]}});
    if(path.endsWith('/quote')) {
      const payload=route.request().postDataJSON();
      const total=payload.items.reduce((sum:number,x:any)=>sum+x.quantity*(x.line_index===0?1000:300),0);
      return route.fulfill({json:{total_amount:total,subtotal:total,paid_amount:0,amount_due:total,gift_choices:[],gift_required:false}});
    }
    if(route.request().method()==='POST') {
      submitted=route.request().postDataJSON();
      if(mode==='conflict') return route.fulfill({status:409,json:{detail:'Заказ уже принят оператором. Обновите карточку.'}});
      if(mode==='edit') current={...current,version:1,amount:submitted.quoted_total,order_items:JSON.stringify([{id:1,name:'Пицца',price:1000,quantity:2,sum:2000}]),receipt:{subtotal:2000,service_fee:0,delivery_fee:0,discount:0}};
      else current={...current,version:1,receipt_changes:[{kind:'receipt_change_requested',revision:0,actor_role:'customer',created_at:'2026-10-05T10:00:00Z',reason:submitted.reason,before:{items:JSON.parse(current.order_items),total_amount:1000},after:{items:[{name:'Пицца',quantity:2,sum:2000}],total_amount:2000}}]};
      return route.fulfill({json:current});
    }
    return route.fulfill({json:current});
  });
  await page.goto('/cabinet/orders/food/42');
  await page.getByRole('button',{name:mode==='request'?'Запросить изменение':'Изменить состав заказа',exact:true}).click();
  const dialog=page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button',{name:'Увеличить Пицца',exact:true}).click();
  await dialog.getByRole('textbox',{name:mode==='request'?'Комментарий оператору':'Причина изменения',exact:true}).fill('Добавить порцию');
  const save=dialog.getByRole('button',{name:mode==='request'?/Отправить запрос оператору/:/Подтвердить и сохранить/});
  await expect(save).toBeEnabled();
  await expect(save).toContainText('2 000');
  expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  await page.screenshot({path:info.outputPath(`customer-${mode}.png`)});
  await save.click();
  if(mode==='conflict') {
    await expect(dialog.getByRole('alert')).toContainText('уже принят оператором');
    await dialog.getByRole('button',{name:'Закрыть',exact:true}).first().click();
    await expect(page.getByRole('region',{name:'Чек заказа'})).toContainText('1 000');
  } else {
    await expect(dialog).toHaveCount(0);
    if(mode==='edit') await expect(page.getByRole('region',{name:'Чек заказа'})).toContainText('2 000');
    else {
      await expect(page.getByRole('region',{name:'Чек заказа'})).toContainText('1 000');
      await page.getByText('История чеков и запросов (1)',{exact:true}).click();
      await expect(page.getByText('Запрос изменения · чек не изменён',{exact:true})).toBeVisible();
    }
  }
  expect(submitted.expected_version).toBe(0);
  expect(submitted.items[0].quantity).toBe(2);
});

test('operator can inspect the complete proposed receipt',async({page},info)=>{
  await setup(page,order);
  await page.addInitScript(()=>{localStorage.setItem('_partner_token_dam_alem','test');localStorage.setItem('_dam_alem_partner_token','test');});
  const staffOrder={...order,id:42,version:1,status:'confirmed',total_amount:6350,customer_name:'Клиент',customer_phone:'+77000000000',delivery_address:'Тестовая 1',comment:'',created_at:'2026-10-05T10:00:00Z',operator_note:'',cancellation_reason:''};
  const proposed={kind:'receipt_change_requested',revision:0,actor_role:'customer',reason:'Добавить сыр',after:{items:[{name:'Предложенное комбо',quantity:1,sum:2500,modifiers:[{name:'Двойной сыр',quantity:2,price:200}],combo_components:[{name:'Большой бургер',quantity:1}]}],total_amount:2500,receipt:{subtotal:2500,service_fee:0,delivery_fee:0,discount:0}}};
  await page.route('**/api/**',async route=>{
    const path=new URL(route.request().url()).pathname;
    let json:any={items:[],total:0};
    if(path.endsWith('/modules'))json={food:true,dam_alem:true,account:true};
    if(path.includes('verify-session'))json={valid:true,display_name:'Оператор'};
    if(path.endsWith('/shifts/me'))json={staff:{id:1,name:'Оператор',role:'operator',pin_set:true},shift:{id:1,staff_name:'Оператор',role:'operator',active:true,opened_at:'2026-10-05T10:00:00Z'}};
    if(path.endsWith('/business/me'))json={role:'operator',name:'Оператор'};
    if(path.endsWith('/operations/orders'))json={items:[staffOrder],total:1};
    if(path.endsWith('/operations/orders/42'))json={order:staffOrder,events:[{id:1,actor:'Клиент',message:'Клиент просит изменить',created_at:'2026-10-05T10:00:00Z',notification:'none',public_data:JSON.stringify(proposed)}]};
    await route.fulfill({json});
  });
  await page.goto('/partner/dam-alem?section=orders&order=42');
  await page.getByText('История чеков и запросов (1)',{exact:true}).click();
  await page.getByText('Запрос изменения · чек не изменён',{exact:true}).click();
  await expect(page.getByText('Предложенное комбо',{exact:true})).toBeVisible();
  await expect(page.getByText('Состав: Большой бургер × 1',{exact:true})).toBeVisible();
  await expect(page.getByText(/Двойной сыр × 2/)).toBeVisible();
  await page.screenshot({path:info.outputPath('operator-proposed-receipt.png'),fullPage:true});
});
