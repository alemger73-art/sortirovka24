"""Debt, fixed courier tariffs, delivery exceptions and distinct refunds."""
import json
from sqlalchemy import select,func
import pytest
from models.food_settings import Food_settings
from models.food_orders import Food_orders
from models.food_operations import FoodOrderEvent
from models.logistics import LogisticsTask
from models.courier_workflow import CourierLedger,CourierDeliveryIssue
from services.dam_settlement import settlement_view
from tests.test_dam_order_workflow import env,BASE,owner_headers
from tests.test_dam_courier_workflow import assigned,login,COURIER
from tests.test_dam_payment_lifecycle import change

@pytest.mark.parametrize('tariff',[None,'','NaN','Infinity','-1','invalid','50001','2.345'])
async def test_no_tariff_never_uses_customer_delivery_price(env,tariff):
    client,maker,operator,_=env
    async with maker() as db:
        rate=await db.scalar(select(Food_settings).where(Food_settings.setting_key=='courier_payout'))
        if tariff is None:await db.delete(rate)
        else:rate.setting_value=tariff
        db.add(Food_settings(setting_key='delivery_price',setting_value='700'))
        order=await db.get(Food_orders,1);order.pricing_snapshot=json.dumps({'breakdown':{'delivery_fee':900}})
        await db.commit()
    assert (await change(env,1,status='preparing')).status_code==200
    blocked=await change(env,1,status='ready')
    assert blocked.status_code==409 and 'Тариф' in blocked.text
    async with maker() as db:
        assert (await db.get(Food_orders,1)).status=='preparing'
        assert await db.scalar(select(func.count()).select_from(LogisticsTask))==0

@pytest.mark.parametrize('actor',['courier','operator'])
async def test_delivered_debt_is_nonblocking_and_late_payment_is_unique(env,actor):
    client,maker,operator,_=env
    tid=await assigned(env);auth=await login(client)
    if actor=='courier':
        path=f'/api/v1/logistics/tasks/{tid}/status';headers=auth;body={'status':'delivered','cash_received':False}
    else:
        version=(await client.get(BASE+'/orders/1',headers=operator)).json()['order']['version']
        path=BASE+'/orders/1/manual-delivery';headers=operator;body={'expected_version':version,'reason':'customer','cash_received':False,'comment':'Customer awaits payment'}
    for _ in range(2):assert (await client.post(path,headers=headers,json=body)).status_code==200
    detail=(await client.get(BASE+'/orders/1',headers=operator)).json()['order']
    assert detail['status']=='done' and detail['settlement_state']=='DEBT' and detail['debt_amount']==1200
    assert (await client.get(BASE+'/orders?status=active',headers=operator)).json()['total']==0
    assert (await client.get(BASE+'/orders?status=debt',headers=operator)).json()['total']==1
    assert (await client.get(BASE+'/deliveries',headers=operator)).json()['items']==[]
    preview=(await client.get('/api/v1/dam-alem/shifts/close-preview',headers=operator)).json()
    assert preview['can_close'] and preview['debt_total']==1200
    assert (await client.post(COURIER+'/shift/close',headers=auth,json={'pin':'2954'})).status_code==200
    close=await client.post('/api/v1/dam-alem/shifts/close',headers=operator,json={'pin':'2222','procurement':{'not_required':True,'reason':'No procurement','items':[]}})
    assert close.status_code==200,close.text
    # Owner can record a later actual receipt without reopening the delivery.
    for _ in range(2):
        current=(await client.get(BASE+'/orders/1',headers=owner_headers())).json()['order']
        paid=await client.patch(BASE+'/orders/1',headers=owner_headers(),json={'expected_version':current['version'],'payment_status':'paid'})
        assert paid.status_code==200,paid.text
    assert (await client.get(BASE+'/orders?status=debt',headers=owner_headers())).json()['total']==0
    async with maker() as db:
        assert (await db.get(LogisticsTask,tid)).status=='delivered'
        assert await db.scalar(select(func.count()).select_from(CourierLedger).where(CourierLedger.task_id==tid,CourierLedger.event_type=='earning'))==1
        assert await db.scalar(select(func.count()).select_from(FoodOrderEvent).where(FoodOrderEvent.order_id==1,FoodOrderEvent.event_type=='DEBT_CREATED'))==1
        from services.food_payments import movement
        from services.dam_order_workflow import money
        events=(await db.scalars(select(FoodOrderEvent).where(FoodOrderEvent.order_id==1))).all()
        receipts=[movement(event) for event in events if movement(event) and money(movement(event)['amount'])>0]
        assert len(receipts)==1 and money(receipts[0]['amount'])==1200

async def test_legacy_task_requires_explicit_snapshot_before_collecting_cash(env):
    client,maker,operator,_=env;tid=await assigned(env);auth=await login(client)
    async with maker() as db:
        (await db.get(LogisticsTask,tid)).courier_payout=None
        (await db.scalar(select(Food_settings).where(Food_settings.setting_key=='courier_payout'))).setting_value='650'
        await db.commit()
    result=await client.post(f'/api/v1/logistics/tasks/{tid}/status',headers=auth,json={'status':'delivered','cash_received':True})
    assert result.status_code==400
    async with maker() as db:assert await db.scalar(select(func.count()).select_from(CourierLedger))==0
    current=(await client.get(BASE+'/orders/1',headers=operator)).json()['order']
    body={'expected_version':current['version']}
    assert (await client.post(BASE+'/orders/1/courier-payout',headers=auth,json=body)).status_code==403
    for _ in range(2):
        response=await client.post(BASE+'/orders/1/courier-payout',headers=operator,json=body)
        assert response.status_code==200 and response.json()['courier_payout']==650
    async with maker() as db:
        (await db.scalar(select(Food_settings).where(Food_settings.setting_key=='courier_payout'))).setting_value='900'
        await db.commit()
    assert (await client.post(f'/api/v1/logistics/tasks/{tid}/status',headers=auth,json={'status':'delivered','cash_received':True})).status_code==200
    async with maker() as db:
        earnings=await db.scalar(select(CourierLedger).where(CourierLedger.event_type=='earning'))
        assert earnings.amount==650

@pytest.mark.parametrize('reason',['no_answer','wrong_address','refused','payment','other'])
@pytest.mark.parametrize('actor',['operator','courier'])
async def test_delivery_issues_preserve_money_and_cancellation_is_separate(env,reason,actor):
    client,maker,operator,_=env;tid=await assigned(env);auth=await login(client)
    path=BASE+'/orders/1/delivery-issue' if actor=='operator' else f'/api/v1/logistics/tasks/{tid}/issue'
    headers=operator if actor=='operator' else auth
    for _ in range(2):
        response=await client.post(path,headers=headers,json={'reason':reason,'comment':'Synthetic delivery exception'})
        assert response.status_code==200,response.text
    async with maker() as db:
        order=await db.get(Food_orders,1);assert order.status=='in_progress' and order.paid_amount==0
        assert await db.scalar(select(func.count()).select_from(CourierDeliveryIssue))==1
        assert await db.scalar(select(func.count()).select_from(CourierLedger))==0
        issue=await db.scalar(select(CourierDeliveryIssue));iid=issue.id
    response=await client.post(BASE+f'/delivery-issues/{iid}/resolve',headers=operator,json={'resolution':'Address clarified by operator'})
    assert response.status_code==200
    async with maker() as db:
        assert (await db.get(CourierDeliveryIssue,iid)).status=='resolved'
        assert (await db.get(Food_orders,1)).status=='in_progress'

@pytest.mark.parametrize('actor',['operator','courier'])
async def test_other_problem_needs_comment_and_foreign_actor_is_rejected(env,actor):
    client,_,operator,_=env;tid=await assigned(env);auth=await login(client)
    path=BASE+'/orders/1/delivery-issue' if actor=='operator' else f'/api/v1/logistics/tasks/{tid}/issue'
    assert (await client.post(path,json={'reason':'no_answer'})).status_code in (401,403)
    assert (await client.post(path,headers=operator if actor=='operator' else auth,json={'reason':'other','comment':'  '})).status_code==422

async def test_cancellation_leaves_paid_money_until_owner_confirms_refund(env):
    from routers.food_business import city_today
    client,maker,operator,_=env
    response=await change(env,1,status='cancelled',cancellation_reason='Customer declined')
    assert response.status_code==200
    order=(await client.get(BASE+'/orders/1',headers=operator)).json()['order']
    assert order['payment_status']=='paid' and order['settlement_state']=='REFUND_REQUIRED' and order['refund_due']==1200
    refund='/api/v1/dam-alem/business/refunds/1';body={'day':str(city_today()),'note':'Actual money returned to customer'}
    assert (await client.post(refund,headers=operator,json=body)).status_code==403
    assert (await client.post(refund,headers=owner_headers(),json=body)).status_code==200
    view=(await client.get(BASE+'/orders/1',headers=owner_headers())).json()['order']
    assert view['status']=='cancelled' and view['settlement_state']=='REFUNDED' and view['refund_due']==0
    assert (await client.post(refund,headers=owner_headers(),json=body)).status_code==409

async def test_partial_refund_is_not_customer_debt(env):
    from routers.food_business import city_today
    client,maker,_,_=env
    async with maker() as db:
        order=await db.get(Food_orders,1);order.status='done';order.paid_amount=1200
        await db.commit()
    response=await client.post('/api/v1/dam-alem/business/refunds/1',headers=owner_headers(),json={'day':str(city_today()),'note':'Actual partial return','amount':200,'request_key':'partial-refund-1234567890'})
    assert response.status_code==200,response.text
    view=(await client.get(BASE+'/orders/1',headers=owner_headers())).json()['order']
    assert view['settlement_state']=='PARTIALLY_REFUNDED' and not view['is_debt']
    assert (await client.get(BASE+'/orders?status=debt',headers=owner_headers())).json()['total']==0

async def test_payroll_debt_is_not_a_pending_delivery_and_later_payment_is_recognized(env):
    from services.food_payroll import calculate
    _,maker,_,_=env
    async with maker() as db:
        order=await db.get(Food_orders,1)
        order.status='done';order.payment_status='pending';order.paid_amount=0
        order.created_at='2026-09-13T09:00:00Z';order.completed_at='2026-09-13T10:00:00Z'
        await db.commit()
        unpaid=await calculate(db,'2026-09-13')
        assert unpaid['pending_orders']==0 and unpaid['order_ids']==[]
        order.payment_status='paid';order.paid_amount=1200;order.paid_at='2026-09-14T10:00:00Z'
        await db.commit()
        assert (await calculate(db,'2026-09-13'))['order_ids']==[]
        assert (await calculate(db,'2026-09-14'))['order_ids']==[1]

@pytest.mark.parametrize('snapshot',[None,-1,float('nan'),float('inf'),50001,2.345])
def test_invalid_courier_snapshots_never_become_an_implicit_zero(snapshot):
    from services.logistics_service import validate_courier_payout_snapshot
    with pytest.raises(ValueError):validate_courier_payout_snapshot(snapshot)
