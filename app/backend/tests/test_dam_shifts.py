import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from core.auth import create_access_token
from core.database import Base, get_db
from models.food_business import FoodExpense, FoodRefund
from models.food_items import Food_items
from models.food_operations import FoodOperationsSettings, FoodOrderEvent
from models.food_orders import Food_orders
from models.food_restaurants import Food_restaurants
from models.food_shifts import FoodShift, FoodStaffAction, FoodShiftProcurement
from models.food_settings import Food_settings
from models.partner_auth import PartnerCredentials
from routers.food_business import router as business_router
from routers.food_operations import router as operations_router
from routers.food_shifts import router as shifts_router
from utils.courier_pin import hash_courier_pin
from models.auth import User
from models.logistics import CourierProfile, LogisticsTask
from models.food_payment import FoodPayment
from models.courier_workflow import CourierDeliveryIssue


@pytest.fixture
async def shift_env():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    tables = [m.__table__ for m in (
        PartnerCredentials, Food_orders, FoodOrderEvent, FoodOperationsSettings, FoodPayment, CourierDeliveryIssue,
        FoodExpense, FoodRefund, Food_restaurants, Food_items, FoodShift, FoodStaffAction, FoodShiftProcurement, Food_settings, User, CourierProfile, LogisticsTask,
    )]
    async with engine.begin() as conn:
        await conn.run_sync(lambda sync: Base.metadata.create_all(sync, tables=tables))
    maker = async_sessionmaker(engine, expire_on_commit=False)
    async with maker() as db:
        db.add_all([
            PartnerCredentials(id=1, partner_type="dam_alem", email="owner@test.local", password_hash="unused", pin_hash=hash_courier_pin("1111"), display_name="Владелец", is_active=True, access_role="owner"),
            PartnerCredentials(id=2, partner_type="dam_alem", email="operator@test.local", password_hash="unused", pin_hash=hash_courier_pin("2222"), display_name="Оператор 1", is_active=True, access_role="operator"),
        ])
        db.add(Food_restaurants(id=1, name="DAM ALEM 2.0"))
        db.add(Food_items(id=1, restaurant_id=1, name="Пицца", price=2000, is_active=True, available=True))
        await db.commit()

    async def dependency():
        async with maker() as db:
            yield db

    app = FastAPI()
    app.include_router(shifts_router)
    app.include_router(business_router)
    app.include_router(operations_router)
    app.dependency_overrides[get_db] = dependency

    def headers(staff_id: int, role: str):
        token = create_access_token({"role": "partner", "type": "partner_session", "partner_type": "dam_alem", "partner_id": staff_id, "access_role": role})
        return {"Authorization": f"Bearer {token}"}

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client, maker, headers(1, "owner"), headers(2, "operator")
    await engine.dispose()


@pytest.mark.asyncio
async def test_pin_shift_lifecycle_and_work_gate(shift_env):
    client, maker, owner, operator = shift_env
    shifts = "/api/v1/dam-alem/shifts"
    availability = "/api/v1/dam-alem/business/availability/1"

    assert (await client.patch(availability, headers=operator, json={"available": False})).status_code == 409
    assert (await client.post(shifts + "/open", headers=operator, json={"pin": "9999"})).status_code == 401
    opened = await client.post(shifts + "/open", headers=operator, json={"pin": "2222"})
    assert opened.status_code == 200, opened.text
    shift_id = opened.json()["shift"]["id"]
    assert (await client.post(shifts + "/open", headers=operator, json={"pin": "2222"})).status_code == 409

    # Refresh/re-login is represented by a new request with the same personal session.
    status = (await client.get(shifts + "/me", headers=operator)).json()
    assert status["shift"]["id"] == shift_id and status["shift"]["active"] is True
    assert (await client.patch(availability, headers=operator, json={"available": False})).status_code == 200

    # The owner cannot close another employee's shift through the personal endpoint.
    assert (await client.post(shifts + "/close", headers=owner, json={"pin": "1111"})).status_code == 409
    closed = await client.post(shifts + "/close", headers=operator, json={"pin": "2222", "procurement": {"not_required": True, "reason": "Остатков достаточно"}})
    assert closed.status_code == 200 and closed.json()["shift"]["active"] is False
    assert closed.json()["shift"]["duration_seconds"] is not None
    assert (await client.patch(availability, headers=operator, json={"available": True})).status_code == 409

    today = await client.get(shifts + "/today", headers=owner)
    assert today.status_code == 200 and any(row["id"] == shift_id for row in today.json()["items"])
    actions = (await client.get(shifts + "/actions", headers=owner, params={"shift_id": shift_id})).json()["items"]
    assert {row["action"] for row in actions} >= {"shift_opened", "product_availability_changed", "shift_closed"}
    assert all(row["staff_name"] == "Оператор 1" for row in actions)


@pytest.mark.asyncio
async def test_owner_can_manage_personal_pin_without_exposing_it(shift_env):
    client, maker, owner, operator = shift_env
    staff_url = "/api/v1/dam-alem/business/staff"
    rows = await client.get(staff_url, headers=owner)
    assert rows.status_code == 200 and all(row["pin_set"] for row in rows.json())
    assert "pin_hash" not in rows.text and "2222" not in rows.text

    changed = await client.patch(staff_url + "/2", headers=owner, json={"pin": "3333", "name": "Оператор 2"})
    assert changed.status_code == 200, changed.text
    assert (await client.post("/api/v1/dam-alem/shifts/open", headers=operator, json={"pin": "2222"})).status_code == 401
    opened = await client.post("/api/v1/dam-alem/shifts/open", headers=operator, json={"pin": "3333"})
    assert opened.status_code == 200 and opened.json()["shift"]["staff_name"] == "Оператор 2"


@pytest.mark.asyncio
async def test_staff_create_validation_hash_duplicate_and_permissions(shift_env):
    from routers.partner_auth import _verify_password
    client, maker, owner, operator = shift_env
    url = '/api/v1/dam-alem/business/staff'
    body = {'name':'Новый оператор','email':'new@example.invalid','password':'Synthetic-2026!', 'pin':'4567','role':'operator'}
    assert (await client.post(url, headers=operator, json=body)).status_code == 403
    assert (await client.post(url, headers=owner, json={**body,'password':'short'})).status_code == 422
    result = await client.post(url, headers=owner, json=body)
    assert result.status_code == 200, result.text
    assert (await client.post(url, headers=owner, json=body)).status_code == 409
    staff_id = result.json()['id']
    assert (await client.patch(f'{url}/{staff_id}', headers=owner, json={'name':'   '})).status_code == 422
    async with maker() as db:
        row = await db.get(PartnerCredentials, staff_id)
        assert row.password_hash != body['password'] and _verify_password(body['password'], row.password_hash)
        assert row.pin_hash != body['pin']


@pytest.mark.asyncio
async def test_owner_without_shift_overview_finance_and_isolation(shift_env):
    from uuid import uuid4
    from routers.food_business import city_today
    client,maker,owner,operator=shift_env
    base='/api/v1/dam-alem'
    expense={'id':str(uuid4()),'day':str(city_today()),'amount':'150','category':'other','note':'Local test'}
    assert (await client.post(base+'/business/expenses',headers=owner,json=expense)).status_code==200
    assert (await client.get(base+'/shifts/me',headers=owner)).json()['shift'] is None
    assert (await client.get(base+'/business/overview',headers=operator)).status_code==403
    other={'Authorization':'Bearer '+create_access_token({'role':'partner','type':'partner_session','partner_type':'gastronom','partner_id':1})}
    for endpoint in ['/business/overview','/business/staff','/shifts/actions','/operations/orders']:
        assert (await client.get(base+endpoint,headers=other)).status_code==403
    await client.post(base+'/shifts/open',headers=operator,json={'pin':'2222'})
    team=(await client.get(base+'/business/overview',headers=owner)).json()['team']
    assert next(p for p in team if p['id']=='2')['shift']['active']
    assert next(p for p in team if p['id']=='1')['shift'] is None
    response=await client.get(base+'/shifts/actions?staff_type=partner&staff_id=2&action=shift_opened',headers=owner)
    assert len(response.json()['items'])==1
    assert (await client.patch(base+'/business/staff/2',headers=owner,json={'active':False})).status_code==200
    assert (await client.get(base+'/business/today',headers=operator)).status_code==403
    shifts=(await client.get(base+'/shifts/history',headers=owner)).json()['items']
    assert not next(s for s in shifts if s['staff_id']=='2')['active']
    assert (await client.delete(base+'/business/staff/2',headers=owner)).status_code==200
    assert len((await client.get(base+'/shifts/actions?staff_id=2',headers=owner)).json()['items'])>=1


@pytest.mark.asyncio
async def test_courier_access_preserves_history_and_unique_pin(shift_env):
    client,maker,owner,operator=shift_env
    url='/api/v1/dam-alem/business/staff/couriers'
    body={'name':'Local courier','phone':'+77000000101','pin':'9836'}
    assert (await client.post(url,headers=operator,json=body)).status_code==403
    result=await client.post(url,headers=owner,json=body)
    assert result.status_code==200,result.text
    id=result.json()['id']
    assert (await client.post(url,headers=owner,json={**body,'phone':'+77000000102'})).status_code==409
    rows=await client.get(url,headers=owner)
    assert '9836' not in rows.text and 'pin_hash' not in rows.text
    assert (await client.patch(url+'/'+id,headers=owner,json={'active':False})).status_code==200
    assert (await client.patch(url+'/'+id,headers=owner,json={'active':True,'name':'Renamed'})).status_code==200
    assert (await client.delete(url+'/'+id,headers=owner)).status_code==200
    async with maker() as db:
        assert (await db.get(User,id)).name=='Renamed'
        profile=await db.get(CourierProfile,id)
        assert not profile.is_verified and profile.pin_hash is None


@pytest.mark.asyncio
async def test_operator_without_configured_pin_cannot_mutate(shift_env):
    client,maker,owner,operator=shift_env
    async with maker() as db:
        (await db.get(PartnerCredentials,2)).pin_hash=None
        await db.commit()
    assert (await client.patch('/api/v1/dam-alem/business/availability/1',headers=operator,json={'available':False})).status_code==409


@pytest.mark.asyncio
async def test_owner_creation_does_not_require_pin(shift_env):
    client,maker,owner,operator=shift_env
    body={'name':'Second owner','email':'second-owner','password':'Synthetic-2026!','role':'owner'}
    response=await client.post('/api/v1/dam-alem/business/staff',headers=owner,json=body)
    assert response.status_code==200,response.text
    async with maker() as db:
        row=await db.get(PartnerCredentials,response.json()['id'])
        assert row.access_role=='owner' and row.pin_hash is None
    assert (await client.post('/api/v1/dam-alem/business/staff',headers=owner,json={**body,'email':'missing-pin','role':'operator'})).status_code==422
