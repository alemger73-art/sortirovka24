"""Real API/database menu contracts; no client-provided price is authoritative."""
import json
import uuid
from decimal import Decimal
import pytest
from sqlalchemy import select
from models.food_items import Food_items
from models.food_restaurants import Food_restaurants
from models.modifier_groups import Modifier_groups
from models.modifier_options import Modifier_options
from models.item_modifier_groups import Item_modifier_groups
from models.food_orders import Food_orders
from models.food_settings import Food_settings
from models.user_management import UserAction
from services import menu_configuration as M
from services.food_order_validation import validate_food_order
from tests.test_dam_order_workflow import env, owner_headers, BASE as OPS

BASE = '/api/v1/dam-alem/menu'


@pytest.fixture
async def menu(env):
    client, maker, operator, patcher = env
    from routers.dam_menu import router
    client._transport.app.include_router(router)
    async with maker() as db:
        (await db.get(Food_restaurants, 1)).business_id = 'dam_alem'
        for row in (await db.scalars(select(Food_items).where(Food_items.restaurant_id == 1))).all():
            row.business_id = 'dam_alem'
        db.add(Food_restaurants(id=9, name='Other', business_id='other'))
        (await db.get(Food_items, 3)).business_id = 'other'
        await db.commit()
    return client, maker, operator


def group_body(**values):
    return {'name': 'Соусы', 'type': 'quantity', 'min_select': 0, 'max_select': 3,
            'options': [{'name': 'Сырный', 'price': 300}, {'name': 'Барбекю', 'price': 250}], **values}


def item_body(**values):
    return {'name': 'Пепперони', 'price': 3200, 'modifiers_enabled': False, **values}


async def setup_modifiers(client, **group_values):
    response = await client.post(BASE + '/groups', json=group_body(**group_values), headers=owner_headers())
    assert response.status_code == 201, response.text
    g = response.json()
    catalog = (await client.get(BASE + '/manage', headers=owner_headers())).json()
    group = next(x for x in catalog['groups'] if x['id'] == g['id'])
    response = await client.put(BASE + '/items/1', headers=owner_headers(), json=item_body(expected_version=1, modifiers_enabled=True, modifier_group_ids=[g['id']]))
    assert response.status_code == 200, response.text
    return group


async def quote(client, mods=None, choices=None, item=1, **extra):
    return await client.post(BASE + '/line-quote', json={'id': item, 'modifiers': mods or [], 'choices': choices or [], **extra})


async def combo(client, **values):
    body = item_body(name='COMBO ТЕСТ', price=7000, is_combo=True,
                     combo_config={'components': [{'item_id': 1, 'quantity': 1}, {'item_id': 2, 'quantity': 2}], 'groups': []})
    body.update(values)
    response = await client.post(BASE + '/items', headers=owner_headers(), json=body)
    assert response.status_code == 201, response.text
    return response.json(), body


@pytest.mark.asyncio
async def test_owner_group_item_checkboxes_price_edit_disable_archive_and_audit(menu):
    c, maker, _ = menu
    g = await setup_modifiers(c)
    catalog = (await c.get(BASE + '/catalog')).json()
    p = next(p for p in catalog['products'] if p['id'] == 1)
    assert len(p['modifier_groups']) == 1 and p['modifier_groups'][0]['options'][0]['price'] == 300
    assert (await quote(c)).json()['total'] == 3200  # optional may be skipped
    assert (await quote(c, [{'option_id': g['options'][0]['id'], 'quantity': 2}])).json()['total'] == 3800
    changed = group_body(expected_version=g['menu_version'], options=[{'id': g['options'][0]['id'], 'name': 'Сырный', 'price': 450}, {'id':g['options'][1]['id'], 'name':'Барбекю', 'price':250, 'is_active':False}])
    assert (await c.put(BASE + f"/groups/{g['id']}", headers=owner_headers(), json=changed)).status_code == 200
    assert (await quote(c, [{'option_id':g['options'][0]['id']}])).json()['total'] == 3650
    assert (await quote(c, [{'option_id':g['options'][1]['id']}])).status_code == 400
    assert (await c.put(BASE + f"/groups/{g['id']}", headers=owner_headers(), json=changed)).status_code == 409  # stale editor
    for enabled in (False, True):
        body = item_body(expected_version=2 if not enabled else 3, modifiers_enabled=enabled, modifier_group_ids=[g['id']] if not enabled else [])
        assert (await c.put(BASE+'/items/1', headers=owner_headers(), json=body)).status_code == 200
        p = next(p for p in (await c.get(BASE+'/catalog')).json()['products'] if p['id'] == 1)
        assert p['modifier_groups'] == []
        assert (await quote(c,[{'option_id':g['options'][0]['id']}])).status_code == 400
    async with maker() as db:
        assert len((await db.scalars(select(UserAction).where(UserAction.action == 'menu_group_saved'))).all()) == 2
        assert await db.get(Modifier_options,g['options'][1]['id'])  # never deleted


@pytest.mark.asyncio
@pytest.mark.parametrize('case', ['required','min','max','duplicate','wrong','foreign','disabled','archived','group_disabled','single_quantity','zero','fraction','nan','negative','too_large'])
async def test_modifier_validation_rejects_illegal_selection(menu,case):
    c,maker,_=menu
    g=await setup_modifiers(c,is_required=case=='required',min_select=2 if case=='min' else 0,type='single' if case=='single_quantity' else 'quantity',max_select=1 if case=='single_quantity' else 3)
    oid=g['options'][0]['id']; mods=[{'option_id':oid}]
    if case in ('required','min'):mods=[]
    if case=='max':mods[0]['quantity']=4
    if case=='duplicate':mods*=2
    if case=='wrong':mods=[{'option_id':9999}]
    if case in ('foreign','disabled','archived','group_disabled'):
        async with maker() as db:
            o=await db.get(Modifier_options,oid)
            if case=='foreign':o.business_id='other'
            if case=='disabled':o.is_active=False
            if case=='archived':o.archived_at='archived'
            if case=='group_disabled':(await db.get(Modifier_groups,g['id'])).is_active=False
            await db.commit()
    if case=='single_quantity':mods[0]['quantity']=2
    if case in ('zero','fraction','nan','negative','too_large'):mods[0]['quantity']={'zero':0,'fraction':1.1,'nan':'NaN','negative':-1,'too_large':1000000000}[case]
    assert (await quote(c,mods)).status_code in (400,422)


@pytest.mark.asyncio
async def test_price_tampering_ignored_or_rejected_and_multiple_modifiers(menu):
    c,_,_=menu;g=await setup_modifiers(c)
    r=await quote(c,[{'option_id':g['options'][0]['id'],'price':0},{'option_id':g['options'][1]['id'],'price':1}])
    assert r.status_code==200 and r.json()['total']==3750
    assert (await quote(c,price=1)).status_code==422


@pytest.mark.asyncio
@pytest.mark.parametrize('mode',['fixed','choice','with_modifiers'])
async def test_combo_fixed_price_no_double_charge_and_choice_surcharge(menu,mode):
    c,_,_=menu;g=await setup_modifiers(c)
    kwargs={}; choices=[];mods=[];expected=7000
    if mode=='choice':
        kwargs['combo_config']={'components':[],'groups':[{'id':'pizza','name':'Выберите пиццу','min_select':1,'max_select':1,'options':[{'item_id':1,'quantity':1,'surcharge':500},{'item_id':2,'quantity':2,'surcharge':0}]}]}
        choices=[{'group_id':'pizza','item_id':1}];expected+=500
    if mode=='with_modifiers':
        kwargs.update(modifiers_enabled=True,modifier_group_ids=[g['id']]);mods=[{'option_id':g['options'][0]['id'],'quantity':2}];expected+=600
    row,body=await combo(c,**kwargs)
    result=await quote(c,mods,choices,item=row['id'])
    assert result.status_code==200,result.text
    snap=result.json()['item']
    assert snap['sum']==expected and snap['base_price']==7000
    assert snap['combo_components'][0]['name']=='Пепперони'
    changed={**body,'price':6900,'expected_version':1}
    assert (await c.put(BASE+f"/items/{row['id']}",json=changed,headers=owner_headers())).status_code==200
    assert snap['sum']==expected  # snapshot is independent
    assert (await quote(c,mods,choices,item=row['id'])).json()['total']==expected-100
    assert (await c.put(BASE+f"/items/{row['id']}",json={**changed,'expected_version':2,'is_active':False},headers=owner_headers())).status_code==200
    assert (await quote(c,mods,choices,item=row['id'])).status_code==400


@pytest.mark.asyncio
@pytest.mark.parametrize('case',['empty','choice_empty','minmax','negative','negative_surcharge','foreign','nested','duplicate','invalid_quantity','foreign_group'])
async def test_combo_save_validation_and_transaction_rollback(menu,case):
    c,maker,_=menu
    cfg={'components':[{'item_id':1,'quantity':1}],'groups':[]}
    body=item_body(is_combo=True,combo_config=cfg)
    if case=='empty':cfg['components']=[]
    if case in ('choice_empty','minmax','negative_surcharge'):
        cfg['groups']=[{'id':'a','name':'Choose','min_select':1,'max_select':1,'options':[] if case=='choice_empty' else [{'item_id':2,'surcharge':-1 if case=='negative_surcharge' else 0}]}]
        if case=='minmax':cfg['groups'][0]['min_select']=2
    if case=='negative':body['price']=-1
    if case=='foreign':cfg['components'][0]['item_id']=3
    if case=='nested':
        row,_=await combo(c);cfg['components'][0]['item_id']=row['id']
    if case=='duplicate':cfg['components']*=2
    if case=='invalid_quantity':cfg['components'][0]['quantity']=0
    if case=='foreign_group':body.update(modifiers_enabled=True,modifier_group_ids=[9999])
    r=await c.put(BASE+'/items/1',json={**body,'expected_version':1},headers=owner_headers())
    assert r.status_code==422,r.text
    async with maker() as db:
        p=await db.get(Food_items,1)
        assert p.name=='Pizza' and p.menu_version==1 and not p.is_combo


@pytest.mark.asyncio
async def test_availability_reasons_fixed_and_choice_and_invalid_choice(menu):
    c,maker,_=menu;row,_=await combo(c)
    async with maker() as db:
        (await db.get(Food_items,1)).available=False;await db.commit()
    r=await quote(c,item=row['id']);assert r.status_code==409 and 'Pizza' in r.text
    cfg={'components':[],'groups':[{'id':'a','name':'Выберите напиток','min_select':1,'max_select':1,'options':[{'item_id':1,'quantity':1,'surcharge':0},{'item_id':2,'quantity':1,'surcharge':0}]}]}
    ch,_=await combo(c,combo_config=cfg)
    assert (await quote(c,item=ch['id'],choices=[{'group_id':'a','item_id':1}])).status_code==422
    assert (await quote(c,item=ch['id'],choices=[{'group_id':'a','item_id':3}])).status_code==422
    assert (await quote(c,item=ch['id'])).status_code==422
    assert (await quote(c,item=ch['id'],choices=[{'group_id':'a','item_id':2}])).status_code==200
    async with maker() as db:
        (await db.get(Food_items,2)).available=False;await db.commit()
    cat=(await c.get(BASE+'/manage',headers=owner_headers())).json()
    reason=next(p for p in cat['products'] if p['id']==ch['id'])['unavailable_reasons']
    assert any('Выберите напиток' in x for x in reason)


@pytest.mark.asyncio
async def test_operator_customer_permissions_and_cross_business(menu):
    c,_,operator=menu
    for headers in ({},operator,{'Authorization':'Bearer invalid'}):
        assert (await c.post(BASE+'/groups',headers=headers,json=group_body())).status_code in (401,403)
        assert (await c.post(BASE+'/items',headers=headers,json=item_body())).status_code in (401,403)
        assert (await c.get(BASE+'/manage',headers=headers)).status_code in (401,403)
    assert (await c.put(BASE+'/items/3',headers=owner_headers(),json=item_body(expected_version=1))).status_code==404
    assert (await c.post(BASE+'/groups',headers=owner_headers(),json=group_body(business_id='other'))).status_code==422
    assert (await quote(c,item=3)).status_code==400


@pytest.mark.asyncio
async def test_saved_order_keeps_combo_and_modifier_snapshot_after_archive(menu):
    c,maker,operator=menu;g=await setup_modifiers(c);row,body=await combo(c,modifiers_enabled=True,modifier_group_ids=[g['id']])
    draft={'request_key':str(uuid.uuid4()),'customer_name':'Test customer','customer_phone':'+77009998877','delivery_method':'pickup','items':[{'id':row['id'],'quantity':1,'modifiers':[{'option_id':g['options'][0]['id']}]}]}
    q=await c.post(OPS+'/manual/quote',headers=operator,json=draft);assert q.status_code==200,q.text
    made=await c.post(OPS+'/manual',headers=operator,json={**draft,'quoted_total':q.json()['total_amount']});assert made.status_code==201,made.text
    saved=made.json();before=json.loads(saved['order_items'])
    assert before[0]['sum']==7300 and before[0]['modifiers'][0]['price']==300
    assert (await c.put(BASE+f"/groups/{g['id']}",headers=owner_headers(),json=group_body(expected_version=1,archived=True,options=[]))).status_code==200
    assert (await c.put(BASE+f"/items/{row['id']}",headers=owner_headers(),json={**body,'expected_version':1,'archived':True,'modifier_group_ids':[]})).status_code==200
    async with maker() as db:
        order=await db.get(Food_orders,saved['id'])
        assert json.loads(order.order_items)==before
        assert await db.get(Food_items,row['id']) and await db.get(Modifier_options,g['options'][0]['id'])


@pytest.mark.asyncio
@pytest.mark.parametrize('source',['app','operator','whatsapp'])
async def test_combo_promo_bonus_common_quote(menu,source):
    c,maker,_=menu;g=await setup_modifiers(c);row,_=await combo(c,modifiers_enabled=True,modifier_group_ids=[g['id']])
    from services import crm,loyalty as L
    async with maker() as db:
        customer=await crm.resolve(db,'+77002223344','Test',business_id='dam_alem',source=source)
        await L.adjust(db,customer.id,1000,'Testing combo pricing',str(uuid.uuid4()),{'id':'owner','role':'owner'})
        db.add(Food_settings(setting_key='promo_codes',setting_value=json.dumps([{'code':'COMBO10','type':'percent','value':10,'active':True}])))
        await db.commit()
        data,lines,total=await validate_food_order(db,{'restaurant_id':1,'customer_name':'Test','customer_phone':customer.normalized_phone,'delivery_method':'pickup','payment_method':'cash','order_source':source,'promo_code':'COMBO10','order_items':json.dumps([{'id':row['id'],'quantity':1,'modifiers':[{'option_id':g['options'][0]['id']}]}])},staff_quote=True,server_pricing=True,account_user=customer,bonus_points_to_use=1000)
        assert lines[0]['sum']==7300
        assert total==5570 and Decimal(data['loyalty_snapshot']['eligible_amount'])==5570


@pytest.mark.asyncio
async def test_existing_receipt_increase_validates_without_name_error(menu):
    c,_,operator=menu
    r=await c.post(OPS+'/orders/1/receipt/quote',headers=operator,json={'expected_version':0,'items':[{'line_index':0,'quantity':2}],'reason':'Client asks more'})
    assert r.status_code==200,r.text


@pytest.mark.asyncio
async def test_legacy_editor_preserves_business_and_invalidates_owner_version(menu):
    c,maker,_=menu
    from services.food_items import Food_itemsService
    from fastapi import HTTPException
    async with maker() as db:
        svc=Food_itemsService(db)
        row=await svc.update(1,{'price':1700})
        assert row.menu_version==2 and row.business_id=='dam_alem'
        with pytest.raises(HTTPException):await svc.update(1,{'restaurant_id':9})
        with pytest.raises(HTTPException):await svc.update(1,{'price':-100})
        row=await svc.create({'restaurant_id':1,'name':'Legacy dish','price':900})
        assert row.business_id=='dam_alem'
    stale=await c.put(BASE+'/items/1',headers=owner_headers(),json=item_body(expected_version=1))
    assert stale.status_code==409


@pytest.mark.asyncio
async def test_combo_gift_and_delivery_excluded_from_loyalty_base(menu):
    c,maker,_=menu;row,_=await combo(c)
    from services import crm,loyalty as L
    async with maker() as db:
        old=await db.scalar(select(Food_settings).where(Food_settings.setting_key=='loyalty_enabled'))
        old.setting_value='1'
        db.add(Food_settings(setting_key='delivery_price',setting_value='500'))
        db.add(Food_settings(setting_key='loyalty_gifts',setting_value=json.dumps([{'id':'free-drink','title':'Напиток в подарок','product_id':2,'product_name':'Drink','min_amount':6000,'is_active':True}])))
        customer=await crm.resolve(db,'+77002223345','Gift test',business_id='dam_alem',source='operator')
        await db.commit()
        data,lines,total=await validate_food_order(db,{'restaurant_id':1,'customer_name':'Gift test','customer_phone':customer.normalized_phone,'delivery_method':'delivery','delivery_address':'Test street','payment_method':'cash','selected_gift_id':'free-drink','order_items':json.dumps([{'id':row['id'],'quantity':1}])},staff_quote=True,server_pricing=True,delivery_fee_hint=500,account_user=customer)
        assert lines[-1]['is_gift'] is True and lines[-1]['sum']==0
        assert total==7500 and Decimal(data['loyalty_snapshot']['eligible_amount'])==7000
