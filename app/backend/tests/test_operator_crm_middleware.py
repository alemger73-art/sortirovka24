"""Exercise the production middleware as well as CRM router permissions."""
import pytest
from middleware.entity_guard import EntityWriteGuardMiddleware
from core.database import get_db
from tests.test_dam_order_workflow import env


@pytest.mark.asyncio
async def test_operator_crm_with_production_middleware(env, monkeypatch):
    client, maker, operator, _ = env
    app = client._transport.app
    monkeypatch.setattr('core.database.get_db', app.dependency_overrides[get_db])
    app.add_middleware(EntityWriteGuardMiddleware)
    base = '/api/v1/crm/businesses/dam_alem'
    made = await client.post(base + '/customers', headers=operator,
                             json={'name': 'Test client', 'phone': '+77001112233'})
    assert made.status_code == 200, made.text
    cid = made.json()['id']
    found = await client.get(base + '/customers?q=77001112233', headers=operator)
    assert found.status_code == 200, found.text
    assert any(row['id'] == cid for row in found.json())
    assert (await client.get(base + f'/customers/{cid}', headers=operator)).status_code == 200
    assert (await client.get(base + '/directory', headers=operator)).status_code == 403
    assert (await client.patch(base + f'/customers/{cid}/loyalty', headers=operator,
                              json={'enabled': False, 'reason': 'Test restriction'})).status_code == 403
    assert (await client.get('/api/v1/crm/businesses/other/customers', headers=operator)).status_code == 403
    assert (await client.get('/api/v1/crm/me', headers=operator)).status_code == 403
    assert (await client.get(base + '/customers')).status_code in (401, 403)
