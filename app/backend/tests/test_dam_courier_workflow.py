"""Courier workplace regressions; isolated SQLite and mocked external channels."""
import pytest
import json
from sqlalchemy import select
from tests.test_dam_order_workflow import env, BASE
from models.logistics import LogisticsTask, CourierProfile
from models.food_orders import Food_orders
from services.dam_order_workflow import sync_task
from models.courier_workflow import CourierLedger
from core.auth import create_access_token
from models.food_settings import Food_settings
from sqlalchemy import func

COURIER = '/api/v1/logistics/courier'
BUSINESS = '/api/v1/dam-alem/business'

@pytest.mark.parametrize('value', ['-1', 'NaN', 'Infinity', '50001', '2.345', 'invalid'])
def test_courier_payout_rejects_invalid_setting(value):
    from services.food_settings import validate_setting
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as error:
        validate_setting('courier_payout', value)
    assert error.value.status_code == 422

@pytest.mark.parametrize('value', ['0', '800', '1200.50'])
def test_courier_payout_accepts_valid_setting(value):
    from services.food_settings import validate_setting
    validate_setting('courier_payout', value)

def owner_headers():
    return {'Authorization':'Bearer '+create_access_token({'role':'partner','type':'partner_session','partner_type':'dam_alem','partner_id':2,'sub':'owner'})}

async def login(client):
    result = await client.post(COURIER + '/pin-login', json={'pin': '2954'})
    assert result.status_code == 200, result.text
    return {'Authorization': 'Bearer ' + result.json()['token']}

async def assigned(env, payment='cash'):
    client, maker, headers, _ = env
    async with maker() as db:
        order = await db.get(Food_orders, 1)
        order.status = 'ready'; order.payment_status = 'pending'
        order.paid_amount = 0; order.payment_method = payment
        await sync_task(db, order)
        await db.commit()
    result = await client.post(BASE + '/orders/1/assign-courier', headers=headers, json={'courier_id':'courier'})
    assert result.status_code == 200, result.text
    async with maker() as db:
        return (await db.scalar(select(LogisticsTask))).id

@pytest.mark.asyncio
async def test_shift_active_delivery_and_update_in_transit(env):
    client, maker, headers, _ = env
    await assigned(env)
    auth = await login(client)
    close = await client.post(COURIER + '/shift/close', headers=auth, json={'pin':'2954'})
    assert close.status_code == 409 and '№1' in close.text
    async with maker() as db:
        version = (await db.get(Food_orders, 1)).version
        task = await db.scalar(select(LogisticsTask))
        task.dropoff_lat = 49.9; task.dropoff_lng = 73.2
        await db.commit()
    change = await client.patch(BASE + '/orders/1', headers=headers, json={'expected_version':version,
        'payment_status':'paid', 'delivery_address':'Corrected street 2', 'operator_note':'Called'})
    assert change.status_code == 200, change.text
    async with maker() as db:
        task = await db.scalar(select(LogisticsTask))
        assert task.status == 'on_the_way' and task.courier_id == 'courier'
        assert task.dropoff_lat is None and task.dropoff_lng is None
    assert (await client.patch(BASE + '/orders/1', headers=headers, json={'expected_version':version,'operator_note':'stale'})).status_code == 409

@pytest.mark.asyncio
async def test_pin_cabinet_does_not_serialize_unassigned_pool(env):
    client, maker, _, _ = env
    async with maker() as db:
        db.add(LogisticsTask(vertical='other',source_type='other_orders',source_id=900,status='ready',
            pickup_address='Private',dropoff_address='Secret address',customer_phone='+77009999999'))
        await db.commit()
    auth = await login(client)
    result = await client.get(COURIER+'/cabinet',headers=auth)
    assert result.status_code == 200
    assert result.json()['available_tasks'] == [] and result.json()['offered_task'] is None
    assert 'Secret address' not in result.text and '+77009999999' not in result.text

@pytest.mark.asyncio
@pytest.mark.parametrize('lat,lng', [(91,0),(0,-181),(999,999)])
async def test_location_ranges(env,lat,lng):
    client, _, _, _ = env
    auth = await login(client)
    assert (await client.put(COURIER+'/location',headers=auth,json={'lat':lat,'lng':lng})).status_code == 422

@pytest.mark.asyncio
@pytest.mark.parametrize('status', ['delivered','cancelled'])
async def test_terminal_tracking_has_no_live_coordinates(env,status):
    from services.logistics_tracking import build_task_tracking
    task = LogisticsTask(status=status)
    profile = CourierProfile(current_lat=49.9,current_lng=73.2)
    data = await build_task_tracking(task,profile)
    assert data['courier_lat'] is None and data['courier_lng'] is None and data['eta_minutes'] is None

@pytest.mark.asyncio
async def test_cash_custody_handover_earnings_and_owner_payout(env):
    client,maker,operator,_=env
    async with maker() as db:
        db.add(Food_settings(setting_key='courier_payout',setting_value='800'))
        await db.commit()
    tid=await assigned(env)
    auth=await login(client)
    url=f'/api/v1/logistics/tasks/{tid}/status'
    result=await client.post(url,headers=auth,json={'status':'delivered','cash_received':True})
    assert result.status_code==200,result.text
    assert (await client.post(url,headers=auth,json={'status':'delivered','cash_received':True})).status_code==200
    money=(await client.get(COURIER+'/cabinet',headers=auth)).json()['money']
    assert money['cash_balance']==1200 and money['earned']==800 and money['payout_due']==800
    assert money['deliveries']==1
    async with maker() as db:
        order=await db.get(Food_orders,1)
        assert order.payment_status=='paid' and order.paid_amount==1200
        assert await db.scalar(select(func.count()).select_from(CourierLedger))==2
    assert (await client.post(COURIER+'/shift/close',headers=auth,json={'pin':'2954'})).status_code==409
    handover=await client.post(COURIER+'/cash-handover',headers=auth)
    assert handover.status_code==200,handover.text
    hid=handover.json()['id']
    assert (await client.post(COURIER+'/cash-handover',headers=auth)).json()['id']==hid
    assert (await client.get(COURIER+'/cabinet',headers=auth)).json()['money']['cash_balance']==1200
    assert (await client.post(BASE+f'/cash-handovers/{hid}/confirm',headers=auth)).status_code==403
    for _ in range(2):
        confirmed=await client.post(BASE+f'/cash-handovers/{hid}/confirm',headers=operator)
        assert confirmed.status_code==200,confirmed.text
    payload={'request_key':'4fdb7d53-1e45-43bc-912a-150f53187871','amount':'800.00','comment':'Тестовая выплата'}
    assert (await client.post(BUSINESS+'/couriers/courier/payouts',headers=operator,json=payload)).status_code==403
    for _ in range(2):
        payout=await client.post(BUSINESS+'/couriers/courier/payouts',headers=owner_headers(),json=payload)
        assert payout.status_code==200,payout.text
    final=(await client.get(COURIER+'/cabinet',headers=auth)).json()['money']
    assert final['cash_balance']==0 and final['handed_over']==1200 and final['payout_due']==0
    assert (await client.post(COURIER+'/shift/close',headers=auth,json={'pin':'2954'})).status_code==200
    # Lost response retry remains safe even after shift closes.
    assert (await client.post(url,headers=auth,json={'status':'delivered','cash_received':True})).status_code==200
    async with maker() as db:
        assert await db.scalar(select(func.count()).select_from(CourierLedger))==4

@pytest.mark.asyncio
@pytest.mark.parametrize('method',['cash','kaspi_qr','halyk_qr'])
async def test_delivered_unpaid_is_independent_and_bank_cannot_be_forged(env,method):
    client,maker,_,_=env
    tid=await assigned(env,method)
    auth=await login(client)
    url=f'/api/v1/logistics/tasks/{tid}/status'
    if method!='cash':
        bad=await client.post(url,headers=auth,json={'status':'delivered','cash_received':True})
        assert bad.status_code==422,bad.text
    result=await client.post(url,headers=auth,json={'status':'delivered','cash_received':False})
    assert result.status_code==200,result.text
    async with maker() as db:
        order=await db.get(Food_orders,1)
        assert order.status=='done' and order.payment_status=='pending' and order.paid_amount==0
    assert (await client.get(COURIER+'/cabinet',headers=auth)).json()['money']['cash_balance']==0

@pytest.mark.asyncio
async def test_attach_existing_customer_preserves_account(env):
    from models.auth import User
    client,maker,_,_=env
    async with maker() as db:
        db.add(User(id='customer',phone='+77004444444',name='Original customer',role='user',password_hash='unchanged'))
        await db.commit()
    payload={'name':'New courier label','phone':'+77004444444','pin':'8271'}
    denied=await client.post(BUSINESS+'/staff/couriers',headers=owner_headers(),json=payload)
    assert denied.status_code==409
    response=await client.post(BUSINESS+'/staff/couriers',headers=owner_headers(),json={**payload,'attach_existing':True})
    assert response.status_code==200,response.text
    assert response.json()['id']=='customer'
    async with maker() as db:
        user=await db.get(User,'customer')
        assert user.name=='Original customer' and user.role=='user' and user.password_hash=='unchanged'
    logged=await client.post(COURIER+'/pin-login',json={'pin':'8271'})
    assert logged.status_code==200,logged.text

@pytest.mark.asyncio
async def test_issue_lifecycle_reassignment_and_old_courier_loses_access(env):
    from models.courier_workflow import CourierDeliveryIssue
    client,maker,operator,patcher=env
    tid=await assigned(env)
    old_auth=await login(client)
    created=await client.post(BUSINESS+'/staff/couriers',headers=owner_headers(),json={
        'name':'Second courier','phone':'+77006665544','pin':'7148'})
    assert created.status_code==200,created.text
    cid=created.json()['id']
    session=await client.post(COURIER+'/pin-login',json={'pin':'7148'})
    new_auth={'Authorization':'Bearer '+session.json()['token']}
    assert (await client.post(COURIER+'/shift/open',headers=new_auth,json={'pin':'7148'})).status_code==200
    path=f'/api/v1/logistics/tasks/{tid}/issue'
    assert (await client.post(path,headers=new_auth,json={'reason':'other','comment':'Not mine'})).status_code==404
    assert (await client.post(path,headers=old_auth,json={'reason':'other'})).status_code==422
    for reason in ['no_answer','wrong_address','refused','payment','transport','other']:
        body={'reason':reason,'comment':'Test delivery exception'}
        a=await client.post(path,headers=old_auth,json=body)
        assert a.status_code==200,a.text
        assert (await client.post(path,headers=old_auth,json=body)).json()['id']==a.json()['id']
    work=(await client.get(BASE+'/courier-work',headers=operator)).json()
    assert len(work['issues'])==6
    issue_id=work['issues'][0]['id']
    assert (await client.post(BASE+f'/delivery-issues/{issue_id}/resolve',headers=operator,json={'resolution':'Called customer; retry'})).status_code==200
    async with maker() as db:
        version=(await db.get(Food_orders,1)).version
    payload={'courier_id':cid,'expected_version':version,'reason':'Car broke down; handed parcel to colleague'}
    result=await client.post(BASE+'/orders/1/reassign-courier',headers=operator,json=payload)
    assert result.status_code==200,result.text
    assert result.json()['id']==tid
    assert (await client.post(BASE+'/orders/1/reassign-courier',headers=operator,json=payload)).status_code==409
    assert (await client.get(COURIER+'/cabinet',headers=old_auth)).json()['active_tasks']==[]
    assert len((await client.get(COURIER+'/cabinet',headers=new_auth)).json()['active_tasks'])==1
    assert (await client.post(f'/api/v1/logistics/tasks/{tid}/status',headers=old_auth,json={'status':'delivered'})).status_code in (403,404)
    assert (await client.get(f'/api/v1/logistics/tasks/{tid}/tracking',headers=old_auth)).status_code in (403,404)
    assert (await client.get(BASE+'/courier-work',headers=operator)).json()['issues']==[]
    done=await client.post(f'/api/v1/logistics/tasks/{tid}/status',headers=new_auth,json={'status':'delivered','cash_received':False})
    assert done.status_code==200,done.text
    async with maker() as db:
        assert await db.scalar(select(func.count()).select_from(LogisticsTask))==1
        assert await db.scalar(select(func.count()).select_from(CourierLedger).where(CourierLedger.courier_id=='courier'))==0
        assert await db.scalar(select(func.count()).select_from(CourierLedger).where(CourierLedger.courier_id==cid,CourierLedger.event_type=='earning'))==1
        assert all(i.status=='resolved' and i.resolved_at for i in (await db.scalars(select(CourierDeliveryIssue))).all())

@pytest.mark.asyncio
@pytest.mark.parametrize('terminal',['done','cancelled'])
async def test_terminal_delivery_closes_open_issue(env,terminal):
    client,maker,operator,_=env
    tid=await assigned(env);auth=await login(client)
    assert (await client.post(f'/api/v1/logistics/tasks/{tid}/issue',headers=auth,json={'reason':'no_answer'})).status_code==200
    if terminal=='done':
        result=await client.post(f'/api/v1/logistics/tasks/{tid}/status',headers=auth,json={'status':'delivered','cash_received':False})
    else:
        async with maker() as db:version=(await db.get(Food_orders,1)).version
        result=await client.patch(BASE+'/orders/1',headers=operator,json={'expected_version':version,'status':'cancelled','cancellation_reason':'Client refused'})
    assert result.status_code==200,result.text
    assert (await client.get(BASE+'/courier-work',headers=operator)).json()['issues']==[]
    assert (await client.post(COURIER+'/shift/close',headers=auth,json={'pin':'2954'})).status_code==200

@pytest.mark.asyncio
@pytest.mark.parametrize('client_fee',[0,600])
async def test_payout_snapshot_partial_cash_and_current_shift(env,client_fee):
    client,maker,operator,_=env
    async with maker() as db:
        db.add(Food_settings(setting_key='courier_payout',setting_value='800'))
        order=await db.get(Food_orders,1)
        order.pricing_snapshot=json.dumps({'breakdown':{'delivery_fee':client_fee}})
        await db.commit()
    tid=await assigned(env);auth=await login(client)
    async with maker() as db:
        order=await db.get(Food_orders,1);order.paid_amount=200
        await sync_task(db,order)
        # Changing the future tariff must not rewrite the assigned payout.
        (await db.scalar(select(Food_settings).where(Food_settings.setting_key=='courier_payout'))).setting_value='900'
        await db.commit()
    route=f'/api/v1/logistics/tasks/{tid}/status'
    assert (await client.post(route,headers=auth,json={'status':'delivered','cash_received':True,'amount':1})).status_code==422
    result=await client.post(route,headers=auth,json={'status':'delivered','cash_received':True})
    assert result.status_code==200,result.text
    values=(await client.get(COURIER+'/cabinet',headers=auth)).json()['money']
    assert values['cash_balance']==1000 and values['earned']==800
    transfer=(await client.post(COURIER+'/cash-handover',headers=auth)).json()
    assert (await client.post(BASE+f"/cash-handovers/{transfer['id']}/confirm",headers=operator)).status_code==200
    assert (await client.post(COURIER+'/shift/close',headers=auth,json={'pin':'2954'})).status_code==200
    assert (await client.post(COURIER+'/shift/open',headers=auth,json={'pin':'2954'})).status_code==200
    fresh=(await client.get(COURIER+'/cabinet',headers=auth)).json()['money']
    assert fresh['earned']==0 and fresh['deliveries']==0 and fresh['payout_due']==800

@pytest.mark.asyncio
async def test_owner_correction_guards_and_session_revocation(env):
    client,maker,operator,_=env;auth=await login(client)
    url=BUSINESS+'/couriers/courier/cash-adjustments'
    payload={'request_key':'53a6a2f3-2b73-4191-9e74-3c5ec590e386','amount':'100.50','reason':'Opening cash verified'}
    assert (await client.post(url,headers=auth,json=payload)).status_code==403
    assert (await client.post(url,headers=operator,json=payload)).status_code==403
    first=await client.post(url,headers=owner_headers(),json=payload)
    assert first.status_code==200,first.text
    assert (await client.post(url,headers=owner_headers(),json=payload)).json()==first.json()
    assert (await client.post(url,headers=owner_headers(),json={**payload,'amount':'99'})).status_code==409
    assert (await client.get(COURIER+'/cabinet',headers=auth)).json()['money']['cash_balance']==100.5
    assert (await client.patch(BUSINESS+'/staff/couriers/courier',headers=owner_headers(),json={'pin':'9038'})).status_code==200
    assert (await client.get(COURIER+'/cabinet',headers=auth)).status_code==401
    assert (await client.post(COURIER+'/pin-login',json={'pin':'2954'})).status_code==401
    new=await client.post(COURIER+'/pin-login',json={'pin':'9038'})
    assert new.status_code==200
    assert (await client.patch(BUSINESS+'/staff/couriers/courier',headers=owner_headers(),json={'active':False})).status_code==200
    assert (await client.get(COURIER+'/cabinet',headers={'Authorization':'Bearer '+new.json()['token']})).status_code==401
    # Disabling access cannot silently erase the outstanding custody balance.
    details=await client.get(BUSINESS+'/couriers/courier/details',headers=owner_headers())
    assert details.json()['money']['cash_balance']==100.5
    assert details.json()['shifts'][0]['active']

@pytest.mark.asyncio
async def test_push_pin_auth_and_generic_pool_are_restricted(env):
    from routers.push_notifications import router as push_router
    from models.push_devices import PushDevice
    client,maker,operator,_=env
    client._transport.app.include_router(push_router)
    auth=await login(client)
    body={'subscription':{'endpoint':'https://fcm.googleapis.com/fcm/send/synthetic-test-only','keys':{'p256dh':'synthetic-key-value-long','auth':'synthetic-auth'}}}
    assert (await client.post('/api/v1/push/register-web',headers=auth,json=body)).status_code==200
    assert (await client.post('/api/v1/push/register-web',json=body)).status_code==401
    assert (await client.post('/api/v1/push/broadcast',headers=auth,json={'title':'x','body':'y'})).status_code in (401,403)
    async with maker() as db:
        row=await db.scalar(select(PushDevice))
        assert row.user_id=='courier' and row.is_active
        db.add(LogisticsTask(vertical='other',source_type='other_orders',source_id=888,status='ready',pickup_address='A',dropoff_address='Private B'))
        await db.commit()
        task=await db.scalar(select(LogisticsTask))
        tid=task.id
    assert (await client.post(f'/api/v1/logistics/tasks/{tid}/accept',headers=auth)).status_code==409
    assert (await client.get(f'/api/v1/logistics/tasks/{tid}/tracking',headers=auth)).status_code in (403,404)

@pytest.mark.asyncio
async def test_three_deliveries_two_sessions_second_first_and_notifications(env):
    from services.courier_notifications import notify_courier_task
    client,maker,operator,_=env
    auth1=await login(client);auth2=await login(client)
    tasks=[await assigned(env)]
    for oid in (2,3):
        async with maker() as db:
            order=Food_orders(id=oid,restaurant_id=1,restaurant_name='DAM ALEM 2.0',customer_name='Test client',
                customer_phone='+77000000000',status='ready',delivery_method='delivery',delivery_address=f'Street {oid}',
                total_amount=1200,payment_method='cash',payment_status='pending',version=0)
            db.add(order);await db.flush();await sync_task(db,order);await db.commit()
        result=await client.post(BASE+f'/orders/{oid}/assign-courier',headers=operator,json={'courier_id':'courier'})
        assert result.status_code==200,result.text
        tasks.append(result.json()['task_id'])
    assigned_calls=[call for call in notify_courier_task.await_args_list if call.args[2]=='assigned']
    assert len(assigned_calls)==3
    assert (await client.post(BASE+'/orders/1/assign-courier',headers=operator,json={'courier_id':'courier'})).status_code==409
    for auth in (auth1,auth2):
        cab=(await client.get(COURIER+'/cabinet',headers=auth)).json()
        assert {t['id'] for t in cab['active_tasks']}==set(tasks)
        assert (await client.post(COURIER+'/shift/close',headers=auth,json={'pin':'2954'})).status_code==409
    url=f'/api/v1/logistics/tasks/{tasks[1]}/status'
    for auth in (auth1,auth2):
        result=await client.post(url,headers=auth,json={'status':'delivered','cash_received':False})
        assert result.status_code==200,result.text
    cab=(await client.get(COURIER+'/cabinet',headers=auth2)).json()
    assert {t['id'] for t in cab['active_tasks']}=={tasks[0],tasks[2]}
    assert cab['money']['deliveries']==1
    async with maker() as db:version=(await db.get(Food_orders,1)).version
    assert (await client.patch(BASE+'/orders/1',headers=operator,json={'expected_version':version,'status':'cancelled','cancellation_reason':'Cancelled by customer'})).status_code==200
    assert any(call.args[2]=='cancelled' for call in notify_courier_task.await_args_list)
