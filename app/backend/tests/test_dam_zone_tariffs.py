import json
import pytest
from fastapi import HTTPException
from sqlalchemy import select
from models.food_settings import Food_settings
from models.food_orders import Food_orders
from tests.test_dam_order_workflow import env, BASE
from services.dam_zone_tariffs import zone_tariff
from services.logistics_service import resolve_courier_payout

ZONES=[{'id':'near','name':'Ближняя','price':500,'courier_payout':800,'polygon':[[49,72],[49,74],[51,74],[51,72]]}, {'id':'far','name':'Дальняя','price':500,'courier_payout':1200,'polygon':[[51,72],[51,74],[53,74],[53,72]]}]
async def configure(maker):
    async with maker() as db:
        db.add(Food_settings(setting_key='delivery_zones',setting_value=json.dumps(ZONES)))
        await db.commit()

def body(zone='near',key='zone-test-00000001'):
    return {'request_key':key,'customer_name':'Тест','customer_phone':'+77003334455','delivery_address':'Test street 1','delivery_method':'delivery','payment_method':'cash','items':[{'id':1,'quantity':1}], 'delivery_zone_id':zone,'delivery_fee':1}

@pytest.mark.asyncio
async def test_manual_zone_price_and_payout_snapshot(env):
    client,maker,headers,_=env;await configure(maker)
    catalog=(await client.get(BASE+'/catalog',headers=headers)).json()
    assert catalog['zone_tariffs_required'] is True
    assert [x['id'] for x in catalog['delivery_options']]==['near','far'] # identical prices must not merge zones
    draft=body();quote=await client.post(BASE+'/manual/quote',headers=headers,json=draft)
    assert quote.status_code==200,quote.text
    assert quote.json()['delivery_tariff']['courier_payout']==800
    assert quote.json()['total_amount']==2000 # operator-supplied 1 tenge is ignored
    draft['quoted_total']=2000
    saved=await client.post(BASE+'/manual',headers=headers,json=draft)
    assert saved.status_code==201,saved.text
    async with maker() as db:
        order=await db.get(Food_orders,saved.json()['id'])
        tariff=json.loads(order.pricing_snapshot)['delivery_tariff']
        assert tariff=={'zone_id':'near','zone_name':'Ближняя','customer_fee':500,'courier_payout':800}
        zone=(await db.scalar(select(Food_settings).where(Food_settings.setting_key=='delivery_zones')))
        changed=[{**z,'courier_payout':9999} for z in ZONES];zone.setting_value=json.dumps(changed);await db.commit()
        from services.dam_order_workflow import sync_task, task_for
        order.status='ready';await sync_task(db,order);await db.flush()
        task=await task_for(db,order)
        assert task.courier_payout==800 and task.customer_delivery_fee==500
        assert await resolve_courier_payout(db,9000,order=order)==800 # future settings and customer fee cannot alter snapshot

@pytest.mark.asyncio
@pytest.mark.parametrize('zone',[None,'unknown'])
async def test_manual_order_must_choose_configured_zone(env,zone):
    client,maker,headers,_=env;await configure(maker)
    draft=body(zone)
    result=await client.post(BASE+'/manual/quote',headers=headers,json=draft)
    assert result.status_code==409,result.text

@pytest.mark.parametrize('value',[None,'',-1,'NaN','Infinity',50001,1.234])
def test_zone_missing_or_invalid_courier_tariff_never_defaults(value):
    zones=[{**ZONES[0],'courier_payout':value}]
    with pytest.raises(HTTPException) as exc:zone_tariff({'delivery_zones':json.dumps(zones)},'near')
    assert exc.value.status_code==409

@pytest.mark.asyncio
async def test_customer_free_delivery_keeps_full_courier_pay(env):
    _,maker,_,patch=env;await configure(maker)
    from unittest.mock import AsyncMock
    patch.setattr('services.food_order_validation._resolve_trusted_delivery_coords',AsyncMock(return_value=(50,73)))
    from services.food_order_validation import validate_food_order
    async with maker() as db:
        db.add(Food_settings(setting_key='free_delivery_from',setting_value='1000'));await db.commit()
        data={'restaurant_id':1,'restaurant_name':'DAM ALEM 2.0','customer_name':'Тест','customer_phone':'+77003334455','delivery_address':'Test street 1','delivery_method':'delivery','payment_method':'cash','order_items':json.dumps([{'id':1,'quantity':1}])}
        sanitized,_,total=await validate_food_order(db,data,server_pricing=True)
        snapshot=json.loads(sanitized['pricing_snapshot'])
        assert snapshot['delivery_tariff']['courier_payout']==800
        assert snapshot['breakdown']['delivery_fee']==0
        assert total==1500

@pytest.mark.parametrize('zones',[[{**ZONES[0],'price':-1}], [{**ZONES[0],'courier_payout':None}], [ZONES[0],ZONES[0]]])
def test_owner_cannot_save_invalid_zone_configuration(zones):
    from services.food_settings import validate_setting
    with pytest.raises(HTTPException) as exc:validate_setting('delivery_zones',json.dumps(zones))
    assert exc.value.status_code==422

def test_owner_can_save_complete_zone_configuration():
    from services.food_settings import validate_setting
    validate_setting('delivery_zones',json.dumps(ZONES))

@pytest.mark.asyncio
async def test_legacy_order_zone_can_be_fixed_without_repricing_cash(env):
    client,maker,headers,_=env;await configure(maker)
    async with maker() as db:
        order=await db.get(Food_orders,1);order.payment_method='cash';order.payment_status='pending';order.paid_amount=0
        order.cash_given_amount=2000;order.change_amount=800;await db.commit()
    result=await client.post(BASE+'/orders/1/delivery-zone',headers=headers,json={'expected_version':0,'zone_id':'near'})
    assert result.status_code==200,result.text
    async with maker() as db:
        order=await db.get(Food_orders,1)
        assert order.total_amount==1200 and order.cash_given_amount==2000 and order.change_amount==800
        assert await resolve_courier_payout(db,order=order)==800
    # The fixed zone cannot be changed silently to another wage.
    assert (await client.post(BASE+'/orders/1/delivery-zone',headers=headers,json={'expected_version':1,'zone_id':'far'})).status_code==409
    assert (await client.post(BASE+'/orders/1/delivery-zone',json={'expected_version':1,'zone_id':'near'})).status_code==403
    changed=await client.post(BASE+'/orders/1/receipt',headers=headers,json={'expected_version':1,'items':[{'line_index':0,'quantity':1},{'id':2,'quantity':1}],'reason':'Клиент изменил состав','quoted_total':1500})
    assert changed.status_code==200,changed.text
    assert changed.json()['cash_given_amount']==2000 and changed.json()['change_amount']==500

@pytest.mark.asyncio
async def test_legacy_order_missing_zone_cannot_use_global_fallback(env):
    _,maker,_,_=env;await configure(maker)
    async with maker() as db:
        with pytest.raises(HTTPException) as exc:await resolve_courier_payout(db,9000,order=await db.get(Food_orders,1))
        assert exc.value.status_code==409

@pytest.mark.asyncio
async def test_unconfigured_zone_keeps_order_intake_but_blocks_handover(env):
    client,maker,headers,_=env
    async with maker() as db:
        zones=[{**ZONES[0],'courier_payout':None}]
        db.add(Food_settings(setting_key='delivery_zones',setting_value=json.dumps(zones)))
        await db.commit()
    draft=body();draft['quoted_total']=2000
    saved=await client.post(BASE+'/manual',headers=headers,json=draft)
    assert saved.status_code==201,saved.text
    order_id=saved.json()['id']
    from services.dam_order_workflow import sync_task,task_for
    async with maker() as db:
        order=await db.get(Food_orders,order_id)
        assert json.loads(order.pricing_snapshot)['delivery_tariff']['courier_payout'] is None
        order.status='ready'
        with pytest.raises(HTTPException) as exc:await sync_task(db,order)
        assert exc.value.status_code==409
        assert await task_for(db,order) is None
        await db.rollback()
        setting=await db.scalar(select(Food_settings).where(Food_settings.setting_key=='delivery_zones'))
        setting.setting_value=json.dumps([ZONES[0]])
        await db.commit()
    # Setting a tariff must not silently change an already placed order.
    async with maker() as db:
        order=await db.get(Food_orders,order_id)
        assert json.loads(order.pricing_snapshot)['delivery_tariff']['courier_payout'] is None
    fixed=await client.post(BASE+f'/orders/{order_id}/delivery-zone',headers=headers,json={'expected_version':saved.json()['version'],'zone_id':'near'})
    assert fixed.status_code==200,fixed.text
    assert fixed.json()['delivery_tariff']['courier_payout']==800
    async with maker() as db:
        order=await db.get(Food_orders,order_id)
        assert order.total_amount==2000
        order.status='ready';await sync_task(db,order);await db.flush()
        assert (await task_for(db,order)).courier_payout==800
