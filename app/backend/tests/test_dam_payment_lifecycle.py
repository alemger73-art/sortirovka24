"""Real API + database scenarios for the payment/delivery/closing contract."""
import hashlib
import hmac
import json
import pytest
from sqlalchemy import select, func
from models.food_payment import FoodPayment
from models.food_operations import FoodOrderEvent
from models.food_orders import Food_orders
from models.food_shifts import FoodStaffAction, FoodShift
from tests.test_dam_order_workflow import env, BASE, owner_headers


async def create(env, method='cash', fulfillment='pickup', given=None, source='operator'):
    client, maker, operator, _ = env
    body = {'request_key':f'test-{method}-{fulfillment}-{source}'.replace('_','-'), 'customer_name':'Test',
        'customer_phone':'+77003334455', 'delivery_method':fulfillment, 'payment_method':method,
        'delivery_address':'Test street 1', 'delivery_fee':0, 'items':[{'id':2,'quantity':26}]}
    if given is not None:
        body['cash_given_amount'] = given
    quote = await client.post(BASE+'/manual/quote', headers=operator, json=body)
    assert quote.status_code == 200, quote.text
    response = await client.post(BASE+'/manual', headers=operator, json={**body,'quoted_total':quote.json()['total_amount']})
    assert response.status_code == 201, response.text
    order = response.json()
    if source != 'operator':
        async with maker() as db:
            row = await db.get(Food_orders,order['id']); row.order_source=source
            await db.commit()
    return order


async def callback(env, order, status='PAID', event='event-1', overrides=None):
    client,maker,_,_ = env
    async with maker() as db:
        p = await db.scalar(select(FoodPayment).where(FoodPayment.order_id==order['id']))
        body = dict(payment_id=p.id,external_id=p.external_id,provider=p.provider,
            amount=str(p.amount),currency='KZT',status=status,event_id=event)
    body.update(overrides or {})
    raw=json.dumps(body).encode()
    signature=hmac.new(b'isolated-test-secret',raw,hashlib.sha256).hexdigest()
    return await client.post('/api/v1/dam-alem/payments/webhook',content=raw,
        headers={'Content-Type':'application/json','X-Payment-Signature':signature})


async def change(env, oid, **values):
    client,_,operator,_=env
    o=(await client.get(BASE+f'/orders/{oid}',headers=operator)).json()['order']
    return await client.patch(BASE+f'/orders/{oid}',headers=operator,json={'expected_version':o['version'],**values})


@pytest.mark.asyncio
@pytest.mark.parametrize('method',['kaspi_qr','halyk_qr'])
async def test_bank_confirmation_is_server_only_and_never_cooks(env,method):
    from services.food_orders import push_food_order_to_frontpad
    client,maker,operator,mp=env
    o=await create(env,method)
    assert (await change(env,o['id'],payment_status='paid')).status_code==403
    assert (await change(env,o['id'],status='preparing')).status_code==409
    assert (await callback(env,o)).status_code==200
    assert (await callback(env,o)).status_code==200
    assert (await callback(env,o,event='other-event-same-payment')).status_code==200
    current=(await client.get(BASE+f"/orders/{o['id']}",headers=operator)).json()['order']
    assert current['status']=='new' and current['payment_status']=='paid'
    assert current['paid_amount']==7800
    push_food_order_to_frontpad.assert_not_awaited()
    # Existing Frontpad transport stays mocked; permit dispatch only for the
    # explicit kitchen transition, never for the bank confirmation above.
    mp.setattr('core.deploy_safety.external_side_effects_allowed', lambda: True)
    assert (await change(env,o['id'],status='preparing')).status_code==200
    push_food_order_to_frontpad.assert_awaited_once()
    async with maker() as db:
        events=(await db.scalars(select(FoodOrderEvent).where(FoodOrderEvent.order_id==o['id']))).all()
        assert len([e for e in events if e.event_type=='PAYMENT_CONFIRMED'])==1
        assert len([e for e in events if e.event_type=='SENT_TO_KITCHEN'])==1


@pytest.mark.asyncio
@pytest.mark.parametrize('state',['WAITING','FAILED','EXPIRED'])
async def test_bank_pending_and_failure_never_credit_money(env,state):
    o=await create(env,'kaspi_qr')
    response=await callback(env,o,status=state)
    assert response.status_code==200,response.text
    assert response.json()['status']==state
    assert (await change(env,o['id'],status='preparing')).status_code==409


@pytest.mark.asyncio
async def test_callback_validation_signature_amount_and_production_disabled(env):
    client,_,_,mp=env
    o=await create(env,'kaspi_qr')
    bad=await client.post('/api/v1/dam-alem/payments/webhook',content=b'{}')
    assert bad.status_code==401
    assert (await callback(env,o,overrides={'amount':'1'})).status_code==409
    assert (await callback(env,o)).status_code==200
    assert (await callback(env,o,status='FAILED')).status_code==409
    mp.setenv('RAILWAY_ENVIRONMENT_ID','production')
    assert (await callback(env,o,event='blocked')).status_code==503


@pytest.mark.asyncio
async def test_late_bank_success_after_cancel_requires_owner_refund(env):
    from routers.food_business import city_today
    client,maker,operator,_=env
    o=await create(env,'halyk_qr')
    assert (await change(env,o['id'],status='cancelled',cancellation_reason='Customer cancelled')).status_code==200
    assert (await callback(env,o,status='EXPIRED',event='expired')).status_code==200
    assert (await callback(env,o,status='WAITING',event='stale-waiting')).json()['status']=='EXPIRED'
    assert (await callback(env,o,event='late-paid')).status_code==200
    detail=(await client.get(BASE+f"/orders/{o['id']}",headers=operator)).json()['order']
    assert detail['status']=='cancelled' and detail['paid_amount']==7800
    body={'day':str(city_today()),'note':'Real refund confirmed by owner'}
    path=f"/api/v1/dam-alem/business/refunds/{o['id']}"
    assert (await client.post(path,headers=operator,json=body)).status_code==403
    assert (await client.post(path,headers=owner_headers(),json=body)).status_code==200
    assert (await callback(env,o,event='duplicate-after-refund')).json()['status']=='REFUNDED'
    async with maker() as db:
        assert (await db.get(Food_orders,o['id'])).paid_amount==0
    detail=(await client.get(BASE+f"/orders/{o['id']}",headers=operator)).json()['order']
    assert detail['payment_state']=='REFUNDED'


@pytest.mark.asyncio
async def test_manual_completion_requires_reason_permission_and_cash_choice(env):
    client,_,operator,_=env
    o,_=await assigned(env)
    current=(await client.get(BASE+f"/orders/{o['id']}",headers=operator)).json()['order']
    path=BASE+f"/orders/{o['id']}/manual-delivery"
    body={'expected_version':current['version'],'reason':'other'}
    assert (await client.post(path,json=body)).status_code in (401,403)
    assert (await client.post(path,headers=operator,json=body)).status_code==422
    assert (await client.post(path,headers=operator,json={**body,'cash_received':False})).status_code==422
    response=await client.post(path,headers=operator,json={**body,'cash_received':True,'amount':7000,'comment':'Partial cash received'})
    assert response.status_code==200,response.text
    assert response.json()['paid_amount']==7000 and response.json()['payment_status']=='pending'


@pytest.mark.asyncio
@pytest.mark.parametrize('given,change_amount',[(None,0),(8000,200)])
async def test_cash_exact_or_note_is_server_calculated(env,given,change_amount):
    o=await create(env,given=given)
    assert o['cash_given_amount']==(given or 7800)
    assert o['change_amount']==change_amount and o['payment_state']=='CASH_PENDING'


@pytest.mark.asyncio
async def test_cash_less_than_server_total_rejected(env):
    client,_,operator,_=env
    r=await client.post(BASE+'/manual/quote',headers=operator,json={
        'request_key':'cash-invalid-amount', 'customer_name':'Test','customer_phone':'+77003334455',
        'delivery_method':'pickup','payment_method':'cash','cash_given_amount':5000,
        'items':[{'id':2,'quantity':26}]})
    assert r.status_code==422,r.text


async def assigned(env):
    o=await create(env,fulfillment='delivery',given=8000)
    for state in ('preparing','ready'):
        assert (await change(env,o['id'],status=state)).status_code==200
    client,_,operator,_=env
    response=await client.post(BASE+f"/orders/{o['id']}/assign-courier",headers=operator,json={'courier_id':'courier'})
    assert response.status_code==200,response.text
    assert response.json()['status']=='assigned'
    return o,response.json()['task_id']


@pytest.mark.asyncio
async def test_courier_cash_complete_and_duplicate_no_second_credit(env):
    from models.courier_workflow import CourierLedger
    client,maker,_,_=env
    o,tid=await assigned(env)
    from tests.test_dam_courier_workflow import login
    headers=await login(client)
    for state in ('picked_up','on_the_way','arrived'):
        response=await client.post(f'/api/v1/logistics/tasks/{tid}/status',headers=headers,json={'status':state})
        assert response.status_code==200,response.text
        current=(await client.get(BASE+f"/orders/{o['id']}",headers=env[2])).json()['order']
        assert current['workflow_state']==('HANDED_TO_COURIER' if state=='picked_up' else 'COURIER_ON_THE_WAY')
    missing=await client.post(f'/api/v1/logistics/tasks/{tid}/status',headers=headers,json={'status':'delivered'})
    assert missing.status_code==400
    for _ in range(2):
        r=await client.post(f'/api/v1/logistics/tasks/{tid}/status',headers=headers,json={'status':'delivered','cash_received':True})
        assert r.status_code==200,r.text
    async with maker() as db:
        row=await db.get(Food_orders,o['id'])
        assert row.status=='done' and row.payment_status=='paid' and row.paid_amount==7800
        assert await db.scalar(select(func.count()).select_from(CourierLedger).where(CourierLedger.entry_key==f'cash:{tid}'))==1


@pytest.mark.asyncio
@pytest.mark.parametrize('received',[True,False])
async def test_manual_completion_audit_and_independent_cash(env,received):
    client,maker,operator,_=env
    o,tid=await assigned(env)
    current=(await client.get(BASE+f"/orders/{o['id']}",headers=operator)).json()['order']
    body={'expected_version':current['version'],'reason':'courier','cash_received':received,'comment':'Courier phone is offline'}
    for _ in range(2):
        result=await client.post(BASE+f"/orders/{o['id']}/manual-delivery",headers=operator,json=body)
        assert result.status_code==200,result.text
        assert result.json()['payment_status']==('paid' if received else 'pending')
    async with maker() as db:
        actions=(await db.scalars(select(FoodStaffAction).where(FoodStaffAction.action=='manual_delivered',FoodStaffAction.entity_id==str(o['id'])))).all()
        assert len(actions)==1 and actions[0].staff_id=='1'
        details=json.loads(actions[0].details)
        assert details['source']=='operator_manual' and details['cash_received'] is received
        assert details['old_status']=='assigned' and details['new_status']=='delivered'


@pytest.mark.asyncio
async def test_shift_blocks_active_and_unpaid_then_closes_with_saved_summary(env):
    client,maker,operator,_=env
    async with maker() as db:
        existing=await db.get(Food_orders,1);existing.status='done';await db.commit()
    o=await create(env)
    body={'pin':'2222','procurement':{'not_required':True,'reason':'Enough stock','items':[]}}
    assert (await client.post('/api/v1/dam-alem/shifts/close',headers=operator,json=body)).status_code==409
    for state in ('preparing','ready','done'):
        assert (await change(env,o['id'],status=state)).status_code==200
    r=await client.get('/api/v1/dam-alem/shifts/close-preview',headers=operator)
    assert not r.json()['can_close']
    assert (await change(env,o['id'],payment_status='paid')).status_code==200
    closed=await client.post('/api/v1/dam-alem/shifts/close',headers=operator,json=body)
    assert closed.status_code==200,closed.text
    async with maker() as db:
        shift=await db.scalar(select(FoodShift).where(FoodShift.staff_id=='1',FoodShift.staff_type=='partner'))
        assert shift.closed_at and shift.closing_summary['unresolved']==0
        assert shift.closing_summary['payment_methods']['cash']==7800


@pytest.mark.asyncio
async def test_shift_summary_respects_legacy_timezone_and_unknown_method(env):
    from datetime import datetime, timezone
    from services.dam_shift_summary import summary
    _,maker,_,_=env
    async with maker() as db:
        shift=await db.scalar(select(FoodShift).where(FoodShift.staff_id=='1',FoodShift.staff_type=='partner'))
        shift.opened_at=datetime(2026,9,27,20,tzinfo=timezone.utc)
        shift.closed_at=datetime(2026,9,27,21,tzinfo=timezone.utc)
        for at,amount,method in [('2026-09-28T01:30:00+05:00','800','cash'),
            ('2026-09-27T20:40:00','200','unknown'),('2026-09-28T02:30:00+05:00','999','cash')]:
            db.add(FoodOrderEvent(order_id=1,actor='Test',message='Historical money',created_at=at,
                notification='none',public_data=json.dumps({'kind':'cash_movement','amount':amount,'method':method})))
        await db.flush()
        result=await summary(db,shift)
        assert result['receipts']==1000
        assert result['payment_methods']['cash']==800 and result['payment_methods']['unknown']==200


@pytest.mark.asyncio
@pytest.mark.parametrize('source',['app','operator','whatsapp'])
@pytest.mark.parametrize('fulfillment',['delivery','pickup','dine_in'])
async def test_source_fulfillment_matrix(env,source,fulfillment):
    # WhatsApp here is the stored source contract, not a claim of live intake.
    client,_,operator,_=env
    o=await create(env,source=source,fulfillment=fulfillment)
    for state in ('confirmed','preparing','ready'):
        result=await change(env,o['id'],status=state)
        assert result.status_code==200,result.text
        assert result.json()['order_source']==source
        assert result.json()['delivery_method']==fulfillment
    if fulfillment=='delivery':
        result=await client.post(BASE+f"/orders/{o['id']}/assign-courier",headers=operator,json={'courier_id':'courier'})
        assert result.status_code==200,result.text
        current=(await client.get(BASE+f"/orders/{o['id']}",headers=operator)).json()['order']
        result=await client.post(BASE+f"/orders/{o['id']}/manual-delivery",headers=operator,json={
            'expected_version':current['version'],'reason':'customer','cash_received':True})
    else:
        result=await change(env,o['id'],status='done')
    assert result.status_code==200,result.text
    assert result.json()['status']=='done'
