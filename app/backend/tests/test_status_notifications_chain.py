"""Full status chain with real inbox persistence; no external push or GPS."""
from datetime import datetime, timezone
from unittest.mock import AsyncMock
import pytest
from sqlalchemy import select
from models.auth import User
from models.crm import Customer, CustomerIdentity
from models.food_orders import Food_orders
from models.logistics import CourierProfile
from models.user_notifications import UserNotification
from models.courier_workflow import CourierLedger
from services import user_notifications as notifications
from tests.test_dam_order_workflow import env, BASE
from tests.test_dam_courier_workflow import login

REAL_FUNCTIONS={name:getattr(notifications,name) for name in (
 'notify_food_order_status','notify_user_by_phone','notify_logistics_task_status')}

@pytest.mark.parametrize('completed_by', ['operator','courier'])
async def test_kitchen_assignment_completion_inbox_without_gps(env, completed_by):
    client,maker,operator,mp=env
    for name,fn in REAL_FUNCTIONS.items(): mp.setattr(notifications,name,fn)
    mp.setattr(notifications,'broadcast_push',AsyncMock(return_value={'sent':0,'skipped':True}))
    async with maker() as db:
        stamp=datetime.now(timezone.utc)
        db.add(User(id='chain-client',name='Synthetic client',phone='+77000000000',phone_verified_at=stamp,is_active=True))
        customer=await db.scalar(select(Customer).where(Customer.normalized_phone=='+77000000000'))
        customer.user_id='chain-client';customer.verified_at=stamp
        identity=await db.get(CustomerIdentity,'+77000000000')
        if not identity: db.add(CustomerIdentity(normalized_phone='+77000000000',customer_id=customer.id,verified_at=stamp))
        else: identity.verified_at=stamp
        profile=await db.get(CourierProfile,'courier')
        assert profile.current_lat is None and profile.current_lng is None
        await db.commit()
    async def change(status):
        current=(await client.get(BASE+'/orders/1',headers=operator)).json()['order']
        result=await client.patch(BASE+'/orders/1',headers=operator,json={'expected_version':current['version'],'status':status})
        assert result.status_code==200,result.text
    await change('preparing');await change('ready')
    assigned=await client.post(BASE+'/orders/1/assign-courier',headers=operator,json={'courier_id':'courier'})
    assert assigned.status_code==200,assigned.text
    tid=assigned.json()['task_id']
    if completed_by=='courier':
        auth=await login(client)
        for status in ('picked_up','on_the_way','arrived'):
            r=await client.post(f'/api/v1/logistics/tasks/{tid}/status',headers=auth,json={'status':status})
            assert r.status_code==200,r.text
        route=f'/api/v1/logistics/tasks/{tid}/status';body={'status':'delivered'}
    else:
        current=(await client.get(BASE+'/orders/1',headers=operator)).json()['order']
        route=BASE+'/orders/1/manual-delivery';auth=operator
        body={'expected_version':current['version'],'reason':'customer','comment':'Synthetic customer confirmed receipt'}
    for _ in range(2):
        result=await client.post(route,headers=auth,json=body)
        assert result.status_code==200,result.text
    async with maker() as db:
        order=await db.get(Food_orders,1);assert order.status=='done'
        inbox=(await db.scalars(select(UserNotification).where(UserNotification.user_id=='chain-client'))).all()
        for status in ('preparing','ready','in_progress','done'):
            rows=[r for r in inbox if r.event_key==f'food:status:1:{status}']
            assert len(rows)==1,(status,[r.event_key for r in inbox])
            assert rows[0].path=='/cabinet/orders/food/1'
        # The food status "передан курьеру"/"доставлен" already covers pickup and delivery.
        assert not [r for r in inbox if r.event_key.endswith((':picked_up',':delivered')) and r.event_key.startswith('logistics:')]
        ledger=(await db.scalars(select(CourierLedger).where(CourierLedger.task_id==tid))).all()
        assert len([r for r in ledger if r.event_type=='earning'])==1
