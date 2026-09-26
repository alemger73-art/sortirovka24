"""Exercise author/moderator HTTP flows against a real disposable SQL database."""
from datetime import datetime, timedelta, timezone
import pytest
from tests.test_security_stage1 import security_env
from models.real_estate import Real_estate

@pytest.mark.asyncio
async def test_realtor_moderation_correction_and_ownership(security_env):
    client, maker, headers = security_env
    base = '/api/v1/entities/real_estate'
    body = dict(title='Квартира в Сортировке', description='Две комнаты', phone='+77001234567',
                seller_type='realtor', agency_name='Агентство', commission='1%', image_url=None,
                status='approved', user_id='bob', moderation_reason='forged')
    assert (await client.post(base, json=body)).status_code == 401
    r = await client.post(base, json=body, headers=headers['alice'])
    assert r.status_code == 201, r.text
    data = r.json(); lid = data['id']; url = f'{base}/{lid}'
    assert data['user_id']=='alice' and data['moderation_reason'] is None
    assert data['seller_type']=='realtor' and data['agency_name']=='Агентство'
    assert (await client.get(url)).status_code==404
    own = f'/api/v1/account/me/real-estate/{lid}'
    assert (await client.get(own, headers=headers['bob'])).status_code==404
    assert (await client.put(own, json={'title':'Hijack'}, headers=headers['bob'])).status_code==404
    assert (await client.put(url, json={'status':'approved'}, headers=headers['alice'])).status_code in (401,403)
    assert (await client.put(url, json={'status':'rejected'}, headers=headers['panel'])).status_code==422
    r=await client.put(url,json={'status':'rejected','moderation_reason':'Уточните адрес'},headers=headers['panel'])
    assert r.status_code==200,r.text
    assert (await client.get(own,headers=headers['alice'])).json()['moderation_reason']=='Уточните адрес'
    r=await client.put(own,json={'address':'Сортировка, дом 1'},headers=headers['alice'])
    assert r.status_code==200,r.text
    assert r.json()['listing']['status']=='pending'
    assert r.json()['listing']['moderation_reason'] is None
    r=await client.put(url,json={'status':'approved'},headers=headers['panel'])
    assert r.status_code==200,r.text
    assert r.json()['active'] and r.json()['expires_at']
    assert (await client.get(url)).status_code==200
    r=await client.put(own,json={'seller_type':'owner'},headers=headers['alice'])
    assert r.status_code==200,r.text
    assert r.json()['listing']['commission'] is None
    assert r.json()['listing']['agency_name'] is None
    assert (await client.get(url)).status_code==404
    assert (await client.post(own+'/unpublish',headers=headers['alice'])).status_code==200
    assert (await client.get(own,headers=headers['alice'])).json()['status']=='hidden'
    assert (await client.post(own+'/extend',headers=headers['alice'])).status_code==409

@pytest.mark.asyncio
async def test_batch_cannot_bypass_moderation(security_env):
    client, _, headers = security_env
    for h in ({}, headers['alice']):
        r=await client.post('/api/v1/entities/real_estate/batch',json={'items':[{'title':'Bypass','status':'approved'}]},headers=h)
        assert r.status_code in (401,403),r.text

@pytest.mark.asyncio
async def test_invalid_seller_is_rejected(security_env):
    client, _, headers = security_env
    r=await client.post('/api/v1/entities/real_estate',json={'title':'Test','seller_type':'admin'},headers=headers['alice'])
    assert r.status_code==422


@pytest.mark.asyncio
@pytest.mark.parametrize('changes',[{'title':'   '},{'description':''},{'phone':'123'}])
async def test_invalid_author_input_is_not_saved(security_env, changes):
    client, _, headers = security_env
    body={'title':'Apartment','description':'Two rooms','phone':'+77001234567',**changes}
    r=await client.post('/api/v1/entities/real_estate',json=body,headers=headers['alice'])
    assert r.status_code==422,r.text
