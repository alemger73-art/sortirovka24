"""Existing payment/refund contracts through real APIs on disposable databases."""
import pytest
from routers.food_business import city_today
from tests.test_dam_order_workflow import env, BASE, owner_headers


@pytest.mark.asyncio
@pytest.mark.parametrize('method', ['kaspi_qr', 'halyk_qr', 'cash'])
@pytest.mark.parametrize('outcome', ['completed_unpaid', 'paid_completed', 'cancelled_paid'])
async def test_payment_lifecycle_and_owner_aggregates(env, method, outcome):
    client, maker, operator, _ = env
    owner = owner_headers()
    manual = {'request_key':f'payment-{method.replace("_", "-")}-{outcome.replace("_", "-")}',
              'customer_name':'Payment test', 'customer_phone':'+77003334455',
              'delivery_method':'pickup', 'payment_method':method, 'items':[{'id':2,'quantity':2}]}
    quote = await client.post(BASE+'/manual/quote', headers=operator, json=manual)
    assert quote.status_code == 200, quote.text
    created = await client.post(BASE+'/manual', headers=operator,
        json={**manual,'quoted_total':quote.json()['total_amount']})
    assert created.status_code == 201, created.text
    oid = created.json()['id']
    version = created.json()['version']
    async def change(**values):
        nonlocal version
        result = await client.patch(BASE+f'/orders/{oid}', headers=operator,
            json={'expected_version':version, **values})
        assert result.status_code == 200, result.text
        version = result.json()['version']
        return result.json()
    async def report():
        result = await client.get('/api/v1/dam-alem/business/report', headers=owner,
            params={'start':str(city_today()),'end':str(city_today())})
        assert result.status_code == 200, result.text
        return result.json()
    assert created.json()['payment_status'] == 'pending'
    assert float((await report())['sales']) == 0
    if outcome != 'completed_unpaid':
        if method == 'cash':
            paid = await change(payment_status='paid')
        else:
            from tests.test_dam_payment_lifecycle import callback
            assert (await callback(env, created.json())).status_code == 200
            paid = (await client.get(BASE+f'/orders/{oid}',headers=operator)).json()['order']
            version = paid['version']
        assert paid['status'] == 'new' and paid['payment_method'] == method
        finance = await report()
        assert float(finance['receipts']) == 600 and float(finance['sales']) == 0
        assert float(finance['payment_methods'][method]) == 600
    if outcome == 'cancelled_paid':
        order = await change(status='cancelled', cancellation_reason='Customer cancelled')
        assert order['payment_status'] == 'paid' and float(order['paid_amount']) == 600
        overview = (await client.get('/api/v1/dam-alem/business/overview',headers=owner)).json()
        assert next(o for o in overview['recent_orders'] if o['id']==oid)['status']=='cancelled'
        finance = await report()
        assert float(finance['sales']) == 0 and finance['completed'] == 0 and finance['cancelled'] == 1
        assert finance['refunds_needed'] == [{'id':oid,'amount':600}]
        url = f'/api/v1/dam-alem/business/refunds/{oid}'
        body = {'day':str(city_today()),'note':'Test refund recorded'}
        assert (await client.post(url, headers=operator,json=body)).status_code == 403
        refunded = await client.post(url, headers=owner,json=body)
        assert refunded.status_code == 200, refunded.text
        assert (await client.post(url, headers=owner,json=body)).status_code == 409
        finance = await report()
        assert float(finance['receipts']) == 600 and float(finance['refunds']) == 600
        assert float(finance['cash_difference']) == 0 and not finance['refunds_needed']
    else:
        statuses = ['confirmed','preparing','ready','done']
        if outcome == 'completed_unpaid' and method != 'cash':
            blocked = await client.patch(BASE+f'/orders/{oid}',headers=operator,json={'expected_version':version,'status':'preparing'})
            assert blocked.status_code == 409
            from models.food_orders import Food_orders
            async with maker() as db:
                legacy = await db.get(Food_orders,oid); legacy.status='preparing'; await db.commit()
            statuses = ['ready','done']
        for status in statuses:
            order = await change(status=status)
            assert order['payment_status'] == ('pending' if outcome == 'completed_unpaid' else 'paid')
        finance = await report()
        assert float(finance['sales']) == 600 and finance['completed'] == 1
        assert float(finance['receipts']) == (0 if outcome == 'completed_unpaid' else 600)
        assert float(finance['refunds']) == 0
        assert finance['sources']['operator']['count'] == 1
        assert finance['fulfillment']['pickup']['count'] == 1
        detail = (await client.get(BASE+f'/orders/{oid}',headers=owner)).json()['order']
        assert detail['payment_status'] == order['payment_status']
        overview = (await client.get('/api/v1/dam-alem/business/overview',headers=owner)).json()
        assert any(a['key']==f'unpaid:{oid}' for a in overview['attention']) == (outcome == 'completed_unpaid')
