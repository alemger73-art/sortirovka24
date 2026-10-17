import pytest
from routers.partner_auth import _normalize_login
from tests.test_dam_courier_registration import registration
@pytest.mark.parametrize('login,expected',[
    ('readiness-stage-20261006',('email','readiness-stage-20261006')),
    ('operator123456789',('email','operator123456789')),
    ('operator',('email','operator')),
    ('Owner@Test.Invalid',('email','owner@test.invalid')),
    ('+7 (700) 123-45-67',('phone','+77001234567')),
    ('87001234567',('phone','+77001234567')),
    ('7001234567',('phone','+77001234567')),
])
def test_username_digits_are_not_a_phone(login,expected):
    assert _normalize_login(login)==expected
@pytest.mark.asyncio
async def test_owner_created_numeric_username_operator_can_login(registration):
    client,_,owner=registration
    from routers.partner_auth import router
    client._transport.app.include_router(router)
    password='SyntheticReadinessPass!'
    created=await client.post('/api/v1/dam-alem/business/staff',headers=owner,json={'name':'Synthetic operator','email':'readiness-stage-20261006','password':password,'pin':'3928','role':'operator'})
    assert created.status_code==200,created.text
    login=await client.post('/api/v1/partner-auth/dam_alem/login',json={'login':'readiness-stage-20261006','password':password})
    assert login.status_code==200 and login.json()['success'] is True and login.json()['jwt_token']
