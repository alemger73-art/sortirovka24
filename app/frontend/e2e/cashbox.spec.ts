import {test,expect,type Page} from '@playwright/test';

async function setup(page:Page,role='owner',configured=true,shift=true){
  const state={role,configured,shift,balance:10000,entries:[] as Record<string,unknown>[],writes:[] as Record<string,unknown>[],loseReply:false,fail:false};
  page.on('pageerror',error=>{throw error;});
  await page.addInitScript(()=>{localStorage.setItem('_partner_token_dam_alem','test-owner');localStorage.setItem('app_lang','ru');localStorage.setItem('s24_welcome_done','1');});
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  await page.route('**/api/**',async r=>{const path=new URL(r.request().url()).pathname;let json:unknown={items:[],total:0};
    if(path.includes('verify-session'))json={valid:true,display_name:'Test Owner',login:'test'};
    if(path.endsWith('/business/me'))json={role:state.role,name:'Test'};
    if(path.endsWith('/shifts/me'))json={staff:{id:2,name:'Operator',role:'operator',pin_set:true},shift:state.shift?{id:1,staff_name:'Operator',role:'operator',opened_at:new Date().toISOString(),active:true}:null};
    if(path.endsWith('/cashbox'))json={configured:state.configured,balance:state.configured?state.balance:null,entries:state.entries};
    if(path.endsWith('/cashbox/entries')){
      const body=r.request().postDataJSON();state.writes.push(body);
      if(state.fail)return r.fulfill({status:409,json:{detail:'В кассе недостаточно денег. Проверьте остаток и поступления.'}});
      if(!state.entries.some(x=>x.id===body.id)){
        const signed=['expense','withdrawal'].includes(body.kind)?-Number(body.amount):Number(body.amount);
        if(body.kind==='opening'){state.configured=true;state.balance=signed;}else state.balance+=signed;
        state.entries.unshift({...body,amount:signed,label:body.kind==='opening'?'Начальный остаток':'Расход из кассы',actor:state.role==='owner'?'Test Owner':'Operator',created_at:new Date().toISOString()});
      }
      if(state.loseReply){state.loseReply=false;return r.abort();}json={id:body.id};
    }
    await r.fulfill({json});
  });return state;
}

test('owner sets real opening, records expense, history survives reload',async({page},info)=>{
  const s=await setup(page,'owner',false);await page.goto('/partner/dam-alem?section=cashbox');
  await expect(page.getByTestId('cashbox-balance')).toHaveText('Остаток не задан');
  await page.getByLabel('Сумма наличных').fill('10000');await page.getByLabel('Назначение наличных').fill('Пересчёт перед началом учёта');
  page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Зафиксировать остаток'}).click();
  await expect(page.getByTestId('cashbox-balance')).toHaveText(/10\s*000/);
  await page.getByLabel('Сумма наличных').fill('2500');await page.getByLabel('Получатель или вноситель').fill('Алсу');await page.getByLabel('Назначение наличных').fill('Закуп овощей');
  page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Сохранить операцию'}).click();
  await expect(page.getByTestId('cashbox-balance')).toHaveText(/7\s*500/);await page.reload();
  await expect(page.getByText('Алсу · Закуп овощей',{exact:true})).toBeVisible();expect(s.writes.length).toBe(2);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.screenshot({path:info.outputPath('cashbox-owner.png'),fullPage:true});
});

test('operator has cash tab and cannot write without shift or set opening',async({page})=>{
  const s=await setup(page,'operator',true,false);await page.goto('/partner/dam-alem?section=cashbox');
  await expect(page.getByRole('button',{name:'Сохранить операцию'})).toBeDisabled();
  await expect(page.getByLabel('Операция кассы').locator('option[value="correction"]')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Финансы',exact:true})).toHaveCount(0);expect(s.writes.length).toBe(0);
});

test('lost response retry keeps operation id and records cash once',async({page})=>{
  const s=await setup(page,'operator');s.loseReply=true;await page.goto('/partner/dam-alem?section=cashbox');
  await page.getByLabel('Сумма наличных').fill('600');await page.getByLabel('Получатель или вноситель').fill('Айжан');await page.getByLabel('Назначение наличных').fill('Упаковка');
  page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Сохранить операцию'}).click();await expect(page.getByRole('alert')).toBeVisible();
  page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Сохранить операцию'}).click();
  await expect(page.getByTestId('cashbox-balance')).toHaveText(/9\s*400/);expect(s.writes.length).toBe(2);expect(s.writes[0].id).toBe(s.writes[1].id);expect(s.entries.length).toBe(1);
  s.role='owner';await page.reload();await expect(page.getByText('Айжан · Упаковка',{exact:true})).toBeVisible();
});

test('insufficient cash is an error, not a successful write',async({page})=>{
  const s=await setup(page);s.fail=true;await page.goto('/partner/dam-alem?section=cashbox');
  await page.getByLabel('Сумма наличных').fill('12000');await page.getByLabel('Получатель или вноситель').fill('Алсу');await page.getByLabel('Назначение наличных').fill('Закуп');
  page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Сохранить операцию'}).click();
  await expect(page.getByRole('alert')).toContainText('недостаточно денег');await expect(page.getByTestId('cashbox-balance')).toHaveText(/10\s*000/);expect(s.entries.length).toBe(0);
});
