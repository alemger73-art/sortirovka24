"""Cross-cabinet consistency using real checkout, stored receipts, CRM and payroll."""
import json
from decimal import Decimal, ROUND_HALF_UP
import pytest
from sqlalchemy import select
from models.auth import User
from models.food_orders import Food_orders
from models.food_items import Food_items
from models.food_settings import Food_settings
from models.food_payroll import FoodPayrollEmployee, FoodPayrollWork
from services import crm, registration_bonus
from services.food_payroll import calculate
from services.customer_order_receipt import customer_order_receipt
from tests.test_dam_order_workflow import env, BASE, owner_headers
from tests.test_registration_bonus import customer, body

@pytest.mark.asyncio
@pytest.mark.parametrize('spent', [0, 0.01, 149.99, 150, 150.05, 299.95, 299.99, 300])
async def test_bonus_order_receipt_crm_and_salary_agree(env, spent):
    client,maker,operator,_=env
    uid,headers=await customer(maker,verified=True)
    async with maker() as db:
        user=await db.get(User,uid);phone=user.phone
    request=body(spent=spent);request['customer_phone']=phone
    made=await client.post('/api/v1/entities/food_orders',headers=headers,json=request)
    assert made.status_code==201,made.text
    oid=made.json()['id'];expected=round(1500-spent,2)
    receipt=await client.get(f'/api/v1/account/orders/food/{oid}',headers=headers)
    assert receipt.status_code==200 and receipt.json()['amount']==expected
    history=await client.get('/api/v1/account/cabinet',headers=headers)
    assert next(x for x in history.json()['orders'] if x['id']==f'food_{oid}')['amount']==expected
    async with maker() as db:
        order=await db.get(Food_orders,oid)
        assert order.total_amount==expected and (order.bonus_discount_amount or 0)==spent
        snapshot=customer_order_receipt(order)
        assert snapshot and snapshot['subtotal']==1500 and snapshot['discount']==spent
        assert float(await registration_bonus.balance(db,uid))==round(300-spent,2)
        # Explicit synthetic completion; no money APIs or external channels used.
        order.status='done';order.payment_status='paid';order.paid_amount=expected
        order.created_at=order.completed_at=order.paid_at='2026-10-09T10:00:00Z'
        product=await db.get(Food_items,1);product.sales_department='kitchen'
        db.add(FoodPayrollEmployee(id=80,name='Synthetic cook',position='Cook',daily_base=1000,percent=10,basis='kitchen'))
        db.add(FoodPayrollWork(id='test-cook',day='2026-10-09',employee_id=80,daily_base=1000,percent=10,basis='kitchen'))
        await db.commit()
        profile=await crm.overview(db,'dam_alem',order.customer_id)
        assert profile['orders_count']==1 and profile['paid_total']==expected and profile['average_check']==expected
        salary=await calculate(db,'2026-10-09')
        assert salary['sales']['kitchen']==expected and salary['order_ids']==[oid]
        commission=Decimal(str(expected)).__mul__(Decimal('0.1')).quantize(Decimal('0.01'),rounding=ROUND_HALF_UP)
        assert salary['rows'][0]['commission']==float(commission)
        assert salary['rows'][0]['total']==float(Decimal(1000)+commission)
    overview=await client.get('/api/v1/dam-alem/loyalty/owner',headers=owner_headers())
    assert overview.status_code==200,overview.text
    assert overview.json()['liability']==round(300-spent,2)

@pytest.mark.asyncio
async def test_promo_and_registration_bonus_use_food_after_discount(env):
    client,maker,_,_=env
    uid,headers=await customer(maker)
    async with maker() as db:
        db.add(Food_settings(setting_key='promo_codes',setting_value=json.dumps([
            {'code':'TEST10','active':True,'type':'percent','value':10,'min_order':0}])))
        await db.commit()
    request=body(spent=270);request.update(promo_code='TEST10',total_amount=1080)
    result=await client.post('/api/v1/entities/food_orders',headers=headers,json=request)
    assert result.status_code==201,result.text
    async with maker() as db:
        order=await db.get(Food_orders,result.json()['id'])
        assert order.promo_discount_amount==150 and order.bonus_discount_amount==270
        assert order.total_amount==1080 and float(await registration_bonus.balance(db,uid))==30
        assert customer_order_receipt(order)['discount']==420
    request=body(spent=300);request.update(promo_code='TEST10',total_amount=1050)
    assert (await client.post('/api/v1/entities/food_orders',headers=headers,json=request)).status_code==409
    async with maker() as db:
        assert float(await registration_bonus.balance(db,uid))==30
