import {test, expect, type Page} from '@playwright/test';
import jsQR from 'jsqr';
import {createReceiptData, renderReceiptHtml, receiptDate, type PrintableOrder} from '../src/lib/damReceipt';
import {DAM_ALEM_STOREFRONT_URL} from '../src/lib/damAlem';
import {ORDER_SOURCE_PATHS} from '../src/lib/orderRoutes';

const base: PrintableOrder = {id:14,restaurant_name:'DAM ALEM 2.0',created_at:'2026-09-28T15:16:00Z',
  customer_name:'Тестовый клиент',customer_phone:'+7 700 000 00 00',delivery_method:'delivery',
  delivery_address:'Караганда, ул. Тестовая, 10',total_amount:10905,paid_amount:0,payment_status:'pending',payment_method:'cash',
  order_items:JSON.stringify([{name:'Крылышки в панировке',quantity:1,price:4500,sum:4500},
    {name:'Бургер Криспи',quantity:1,price:3200,sum:3200}, {name:'Bubble Oreo',quantity:2,price:1200,sum:2400},
    {name:'Десерт дня',quantity:1,price:0,sum:0,is_gift:true,gift_id:987}]),
  pricing_snapshot:JSON.stringify({breakdown:{subtotal:10100,delivery_fee:805,discount:0,service_fee:0}})};
const data = (patch: Partial<PrintableOrder> = {}) => createReceiptData({...base,...patch});

test('delivery paid Kaspi uses payment facts',()=>{const d=data({paid_amount:10905,payment_status:'paid',payment_method:'kaspi_qr'});expect([d.paid,d.due,d.methodName,d.paymentLabel]).toEqual([10905,0,'KASPI','ОПЛАЧЕНО']);});
test('delivery unpaid cash, including delivered, stays unpaid',()=>{const d=data({status:'done'});expect([d.paid,d.due,d.methodName,d.paymentLabel]).toEqual([0,10905,'НАЛИЧНЫЕ','НЕ ОПЛАЧЕНО']);});
test('partial payment respects backend amount_due',()=>{const d=data({paid_amount:5000,amount_due:5905});expect([d.total,d.paid,d.due,d.paymentLabel]).toEqual([10905,5000,5905,'ЧАСТИЧНО ОПЛАЧЕНО']);expect(data({amount_due:25}).due).toBe(25);});
test('Halyk is a payment method, not confirmation',()=>{expect(data({payment_method:'halyk_qr'}).methodName).toBe('HALYK');expect(data({payment_method:'halyk_qr'}).due).toBe(10905);});
for(const [method,label] of [['pickup','САМОВЫВОЗ'],['dine_in','В ЗАВЕДЕНИИ']]) test(`${method} omits delivery address and charge`,()=>{const d=data({delivery_method:method});expect(d.address).toBe('');expect(d.deliveryFee).toBeUndefined();expect(d.fulfillmentLabel).toBe(label);});
test('preorders use business time and fulfillment-specific label',()=>{for(const [method,label] of [['delivery','ДОСТАВИТЬ К:'],['pickup','ВЫДАТЬ К:'],['dine_in','ПОДАТЬ К:']]) {const html=renderReceiptHtml(data({delivery_method:method,scheduled_for:'2026-09-28T13:30:00Z'}));expect(html).toContain('ПРЕДЗАКАЗ');expect(html).toContain(label);expect(html).toContain('28.09.2026   18:30');}expect(renderReceiptHtml(data())).not.toContain('ПРЕДЗАКАЗ');});
test('timezone is Karaganda, including naive legacy UTC',()=>{expect(receiptDate('2026-09-28T15:16:00')).toBe('28.09.2026   20:16');expect(receiptDate('invalid')).toBe('');});
test('snapshot discount and promo are not repriced',()=>{const d=data({total_amount:9905,pricing_snapshot:JSON.stringify({promo_code:'SORT24',breakdown:{subtotal:10100,discount:1000,delivery_fee:805}})});expect([d.total,d.discount,d.promo]).toEqual([9905,1000,'SORT24']);expect(renderReceiptHtml(d)).toContain('Промокод: SORT24');});
test('no promo or invented promotion is printed',()=>{expect(renderReceiptHtml(data())).not.toContain('Промокод:');expect(renderReceiptHtml(data())).not.toContain('Акция:');});
test('gift is explicit, zero-priced item alone is not a gift',()=>{const d=data({order_items:JSON.stringify([{name:'Gift',price:0,is_gift:true},{name:'Free item',price:0},{name:'Invalid gift',price:200,is_gift:true}])});expect(d.lines.map(l=>l.gift)).toEqual([true,false,false]);expect(renderReceiptHtml(d).match(/ПОДАРОК/g)).toHaveLength(1);});
test('modifiers use names, never internal ids',()=>{const d=data({order_items:JSON.stringify([{name:'Бургер',price:1000,quantity:2,sum:2400,modifiers:[{id:98765,name:'+ сыр',price:200},{id:23456,title:'без лука'},{id:34567}]}])});expect(d.lines[0].modifiers).toEqual(['+ сыр · 200 ₸','без лука']);expect(d.lines[0].amount).toBe(2400);expect(renderReceiptHtml(d)).not.toMatch(/98765|23456|34567/);});
test('customer comment is escaped and technical fields never printed',()=>{const o={...base,comment:'<script>alert(1)</script>',operator_note:'SECRET_INTERNAL',version:53,order_source:'whatsapp',merchant_key:'dam_alem'};const html=renderReceiptHtml(createReceiptData(o));expect(html).toContain('&lt;script&gt;');expect(html).not.toContain('<script>');expect(html).not.toMatch(/SECRET_INTERNAL|merchant_key|whatsapp|gift_id/);});
test('empty comment has no blank heading',()=>{expect(renderReceiptHtml(data({comment:'  '}))).not.toContain('Комментарий:');});
test('free delivery is represented by actual zero',()=>{const d=data({pricing_snapshot:JSON.stringify({breakdown:{subtotal:10100,delivery_fee:0}})});expect(d.deliveryFee).toBe(0);expect(renderReceiptHtml(d)).toContain('Доставка');});
test('unknown legacy breakdown is omitted rather than guessed',()=>{const d=data({pricing_snapshot:'invalid'});expect(d.subtotal).toBeUndefined();expect(d.deliveryFee).toBeUndefined();expect(d.total).toBe(base.total_amount);});
test('receipt has no null, undefined, NaN or raw JSON',()=>{const html=renderReceiptHtml(createReceiptData({order_items:'invalid',created_at:'invalid'}));expect(html).not.toMatch(/undefined|null|NaN/);});
test('receipt does not mutate its order or snapshot',()=>{const order=Object.freeze({...base});const before=JSON.stringify(order);renderReceiptHtml(createReceiptData(order));expect(JSON.stringify(order)).toBe(before);});
test('QR destination matches the public food route and canonical host',()=>{const url=new URL(DAM_ALEM_STOREFRONT_URL);expect(url.origin).toBe('https://www.sortirovka24.kz');expect(url.pathname).toBe(ORDER_SOURCE_PATHS.food);expect(url.search+url.hash).toBe('');});

async function harness(page:Page){await page.route('**/api/**',r=>r.abort());await page.goto('/');}

test('shared native push API registers the current courier identity, not a customer',async({page})=>{
  await harness(page);const auth:string[]=[];
  await page.route('**/api/v1/push/register',async r=>{auth.push(r.request().headers().authorization);await r.fulfill({json:{success:true}});});
  await page.evaluate(async()=>{
    localStorage.setItem('account_token','synthetic-customer');
    localStorage.setItem('s24_dam_courier_token','synthetic-courier');
    history.replaceState(null,'','/food/courier');
    const {pushApiClient}=await import('/receiptPrint.js');
    await pushApiClient.register('synthetic-native-device','android');
    history.replaceState(null,'','/cabinet');
    await pushApiClient.register('synthetic-native-device','android');
  });
  expect(auth).toEqual(['Bearer synthetic-courier','Bearer synthetic-customer']);
});
async function printHtml(page:Page,order:PrintableOrder,native=false,kitchen=false){
  await harness(page);
  return page.evaluate(async({order,native,kitchen})=>{
    if(native){(window as any).androidBridge={};(window as any).Capacitor={PluginHeaders:[{name:'ReceiptPrinter',methods:[{name:'print',rtype:'promise'}]}],nativePromise:async(_plugin:string,_method:string,options:unknown)=>{(window as any).nativeReceipt=options;}};}
    else Object.defineProperty(HTMLIFrameElement.prototype,'contentWindow',{get:(()=>{const original=Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype,'contentWindow')!.get!;return function(this:HTMLIFrameElement){const win=original.call(this);if(win)win.print=()=>{(window as any).printCalls=((window as any).printCalls||0)+1;};return win;};})()});
    const module=await import('/receiptPrint.js');
    const print=kitchen?module.printKitchenOrder:module.printOrder;
    await Promise.all([print(order),print(order)]);
    return native ? (window as any).nativeReceipt : {html:document.querySelector('iframe')!.contentDocument!.documentElement.outerHTML,calls:(window as any).printCalls};
  },{order,native,kitchen});
}

for(const native of [false,true])test(`cash change reaches ${native?'native':'browser'} customer and kitchen print`,async({page})=>{
  const order={...base,status:'preparing',total_amount:7800,cash_given_amount:8000,change_amount:200,comment:'Без лука',order_items:JSON.stringify([{name:'Бургер',quantity:2,price:3900,sum:7800,modifiers:[{name:'Сыр'}]}])};
  let result=await printHtml(page,order,native);
  await page.setContent(result.html);
  await expect(page.getByText('ПОДГОТОВИТЬ СДАЧУ',{exact:true})).toBeVisible();
  expect(createReceiptData(order).change).toBe(200);
  result=await printHtml(page,order,native,true);
  await page.setContent(result.html);
  await expect(page.getByText('Сдача: 200 ₸',{exact:true})).toBeVisible();
  await expect(page.getByText('2 × Бургер',{exact:true})).toBeVisible();
  await expect(page.getByText('+ Сыр',{exact:true})).toBeVisible();
  await expect(page.getByText('Комментарий: Без лука',{exact:true})).toBeVisible();
  if(native)expect(result.paperWidthMm).toBe(58);
});

test('kitchen receipt rejects an order before operator handoff',async({page})=>{
  await harness(page);
  const error=await page.evaluate(async order=>{const {printKitchenOrder}=await import('/receiptPrint.js');try{await printKitchenOrder(order);}catch(e){return (e as Error).message;}}, {...base,status:'new'});
  expect(error).toBe('Сначала передайте заказ на кухню');
});
async function decodeQr(page:Page){const pixels=await page.locator('.qr svg').evaluate(async svg=>{const image=new Image();image.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(new XMLSerializer().serializeToString(svg));await image.decode();const canvas=document.createElement('canvas');canvas.width=224;canvas.height=224;const ctx=canvas.getContext('2d')!;ctx.fillStyle='#fff';ctx.fillRect(0,0,224,224);ctx.drawImage(image,0,0,224,224);return Array.from(ctx.getImageData(0,0,224,224).data);});return jsQR(new Uint8ClampedArray(pixels),224,224)?.data;}

for(const native of [false,true])test(`${native?'native bridge':'browser iframe'} prints same scanned QR without personal data`,async({page})=>{
  const result=await printHtml(page,{...base,comment:'PRIVATE_ORDER_MARKER'},native);
  if(native){expect(result.paperWidthMm).toBe(58);expect(result.paperHeightMm).toBeGreaterThan(100);}else expect(result.calls).toBe(1);
  await page.setContent(result.html);expect(await decodeQr(page)).toBe('https://www.sortirovka24.kz/food');
  await expect(page.getByText('Сканируйте QR-код,')).toBeVisible();await expect(page.getByText('чтобы заказать снова')).toBeVisible();
});

for(const sample of ['cash','paid','long'])test(`58mm print PDF and layout: ${sample}`,async({page},info)=>{
  const order={...base,...(sample==='paid'?{payment_method:'kaspi_qr',payment_status:'paid',paid_amount:10905}:{}),
    ...(sample==='long'?{total_amount:84805,pricing_snapshot:JSON.stringify({breakdown:{subtotal:84000,delivery_fee:805,discount:0,service_fee:0}}),delivery_address:'Караганда, очень длинная улица с названием и ориентиром, дом 125, корпус 5, подъезд 4, квартира 128',comment:'Позвонить перед приездом. Код домофона уточнить у клиента.',order_items:JSON.stringify(Array.from({length:35},(_,i)=>({name:`Бургер с очень длинным названием и дополнительными ингредиентами ${i+1}`,quantity:2,price:1200,sum:2400})))}:{})};
  const result=await printHtml(page,order);await page.setContent(result.html);await page.emulateMedia({media:'print'});
  const box=await page.locator('.receipt').boundingBox();expect(box!.width).toBeCloseTo(58*96/25.4,0);
  // XP-58 has a 48mm printable area inside 58mm paper. Check both edges,
  // including actual text fragments (element boxes alone miss text overflow).
  const overflow=await page.locator('.receipt').evaluate(receipt=>{
    const left=5*96/25.4-1,right=53*96/25.4+1,failures:string[]=[];
    for(const node of receipt.querySelectorAll('*')){
      if(node.closest('svg')) continue;
      const box=node.getBoundingClientRect();
      if(box.width>0&&(box.left<left||box.right>right)) failures.push(node.outerHTML);
    }
    const walker=document.createTreeWalker(receipt,NodeFilter.SHOW_TEXT);
    while(walker.nextNode()){
      const node=walker.currentNode;if(!node.textContent?.trim())continue;
      const range=document.createRange();range.selectNodeContents(node);
      for(const box of range.getClientRects())if(box.width>0&&(box.left<left||box.right>right))failures.push(node.textContent);
    }
    return failures;
  });expect(overflow).toEqual([]);
  expect(await decodeQr(page)).toBe(DAM_ALEM_STOREFRONT_URL);
  await page.locator('.receipt').screenshot({path:info.outputPath(`receipt-${sample}.png`)});
  const pdf=await page.pdf({path:info.outputPath(`receipt-${sample}.pdf`),preferCSSPageSize:true,printBackground:true,displayHeaderFooter:false});
  expect(pdf.length).toBeGreaterThan(3000);
});

for(const native of [false,true])test(`combo components, choices and modifier snapshot reach ${native?'native':'browser'} receipts`,async({page})=>{
 const order={...base,status:'preparing',total_amount:8100,order_items:JSON.stringify([{name:'Комбо для двоих',base_price:7000,price:7500,quantity:1,sum:8100,combo_components:[{name:'Фри',quantity:1},{name:'4 сезона',quantity:1,group_name:'Выберите пиццу',surcharge:500}],modifiers:[{name:'Сырный соус',quantity:2,price:300,sum:600}]}])};
 for(const kitchen of [false,true]){const result=await printHtml(page,order,native,kitchen);await page.setContent(result.html);await expect(page.getByText(/Фри.*1/).first()).toBeVisible();await expect(page.getByText(/Выберите пиццу.*4 сезона/).first()).toBeVisible();await expect(page.getByText(/Сырный соус.*2.*600/).first()).toBeVisible();}
});
