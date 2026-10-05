"""Owner bonus adjustments must find the same normalized phones as CRM."""
import pytest
from services import crm, loyalty
from tests.test_dam_order_workflow import env, owner_headers


@pytest.mark.asyncio
async def test_owner_bonus_search_accepts_local_phone_formats(env):
    client, maker, _, _ = env
    async with maker() as db:
        customer = await crm.resolve(db, '+77004445566', 'Search client', business_id=crm.DAM)
        customer_id = customer.id
        await loyalty.account(db, customer_id)
        await db.commit()
    for phone in ('+77004445566', '87004445566', '7004445566', '+7 (700) 444-55-66'):
        response = await client.get('/api/v1/dam-alem/loyalty/owner/customers',
                                    params={'q': phone}, headers=owner_headers())
        assert response.status_code == 200, response.text
        assert customer_id in [row['id'] for row in response.json()], phone
