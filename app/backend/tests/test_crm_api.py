"""Boundary/API regression: roles, tenant isolation and private notes."""
from unittest.mock import AsyncMock
import pytest
from models.auth import User
from services import crm, loyalty as L
from tests.test_dam_order_workflow import env, owner_headers

@pytest.mark.asyncio
async def test_crm_api_permissions_and_private_notes(env, monkeypatch):
    client, maker, operator, _ = env
    base='/api/v1/crm/businesses/dam_alem'
    body={'phone':'+77004445566','name':'Local client'}
    assert (await client.post(base+'/customers',json=body)).status_code in (401,403)
    made=await client.post(base+'/customers',json=body,headers=operator)
    assert made.status_code==200, made.text
    cid=made.json()['id']
    assert (await client.post(base+'/customers',json={**body,'business_id':'other'},headers=operator)).status_code==422
    note=await client.post(base+f'/customers/{cid}/notes',json={'text':'Staff-only note'},headers=operator)
    assert note.status_code==200,note.text
    assert len((await client.get(base+f'/customers/{cid}',headers=operator)).json()['notes'])==1
    assert (await client.get(base+'/directory',headers=operator)).status_code==403
    own=await client.get(base+'/directory',headers=owner_headers())
    assert own.status_code==200 and any(x['id']==cid for x in own.json()['items'])
    assert (await client.patch(base+f'/customers/{cid}/loyalty',json={'enabled':False,'reason':'Review'},headers=operator)).status_code==403
    assert (await client.get('/api/v1/crm/businesses/other/customers',headers=owner_headers())).status_code==403
    async with maker() as db:
        foreign=await crm.resolve(db,'+77009990011','Other',business_id='other');foreign_id=foreign.id
        u=User(id='crm-client',phone=body['phone'],phone_verified_at=L.now(),name='Client');db.add(u);await db.flush()
        await crm.for_account(db,u);await db.commit()
    assert (await client.get(base+f'/customers/{foreign_id}',headers=operator)).status_code==404
    assert (await client.post(base+f'/customers/{foreign_id}/notes',json={'text':'Not allowed'},headers=operator)).status_code==404
    monkeypatch.setattr('routers.crm.resolve_account_user',AsyncMock(return_value=u))
    visible=await client.get('/api/v1/crm/me/businesses/dam_alem',headers={'Authorization':'test-client'})
    assert visible.status_code==200,visible.text
    assert 'notes' not in visible.json() and 'Staff-only note' not in visible.text
    assert (await client.get('/api/v1/crm/me/businesses/other',headers={'Authorization':'test-client'})).status_code==404
    disabled=await client.patch(base+f'/customers/{cid}/loyalty',json={'enabled':False,'reason':'Customer requested'},headers=owner_headers())
    assert disabled.status_code==200
    assert not (await client.get('/api/v1/crm/me/businesses/dam_alem')).json()['loyalty']['enrolled']
