"""Exercise the actual cabinet endpoints against an isolated in-memory database."""
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from routers import account_v2 as r


@pytest.mark.asyncio
async def test_cabinet_retains_detailed_orders_and_rejects_foreign_owner(monkeypatch):
    engine = create_async_engine('sqlite+aiosqlite:///:memory:')
    models = [r.User, r.Bonus, r.Order, r.Food_orders, r.Complaints, r.Announcements,
              r.Real_estate, r.Master_requests, r.Become_master_requests, r.UserAddress,
              *[entry[3] for entry in r.STORE_ORDER_SOURCES]]
    async with engine.begin() as conn:
        for model in models:
            await conn.run_sync(lambda sync, table=model.__table__: table.create(sync, checkfirst=True))
    user = SimpleNamespace(id='account-uuid', phone='+77011234567', language='ru', agreement_accepted=True, privacy_accepted=True)
    monkeypatch.setattr(r, '_current_user', AsyncMock(return_value=user))
    monkeypatch.setattr(r, '_maybe_promote_master_role', AsyncMock())
    monkeypatch.setattr(r, '_to_user_response', lambda _: {'id': user.id, 'bonus_balance': 450})
    async with AsyncSession(engine) as db:
        db.add(r.Food_orders(id=1, customer_phone=user.phone, status='done', total_amount=5600, order_items='[{"price":2500,"quantity":2,"modTotal":300}]'))
        db.add(r.Order(user_id=user.id, order_type='food', details='Заказ #1', amount=5600, status='done'))
        db.add_all([r.Food_orders(id=i, customer_phone='+77019999999') for i in range(2, 510)])
        db.add(r.Gastronom_orders(id=1, user_id='foreign-account', customer_phone=user.phone, total_amount=9000))
        await db.commit()
        data = await r.cabinet(authorization='test', db=db)
        assert len(data['orders']) == 1
        assert data['orders'][0]['order_number'] == 1
        assert data['orders'][0]['order_items']
        assert data['profile']['bonus_balance'] == 450
        with pytest.raises(HTTPException) as denied:
            await r.cabinet_order_detail('gastronom', 1, authorization='test', db=db)
        assert denied.value.status_code == 404
        detail = await r.cabinet_order_detail('food', 1, authorization='test', db=db)
        assert detail['order_number'] == 1
    await engine.dispose()


@pytest.mark.asyncio
async def test_profile_and_addresses_are_persisted_and_owner_scoped(monkeypatch):
    engine = create_async_engine('sqlite+aiosqlite:///:memory:')
    async with engine.begin() as conn:
        for model in [r.User, r.UserAddress]:
            await conn.run_sync(lambda sync, table=model.__table__: table.create(sync, checkfirst=True))
    async with AsyncSession(engine, expire_on_commit=False) as db:
        user = r.User(id='mine', name='Tester', phone='+77011234567', email='old@example.com', language='ru', role='user', status='active', bonus_balance=450)
        db.add(user)
        await db.commit()
        monkeypatch.setattr(r, '_current_user', AsyncMock(return_value=user))
        monkeypatch.setattr(r, '_log_action', AsyncMock())
        monkeypatch.setattr(r, 'geocode_address', AsyncMock(return_value=(49.8, 73.1)))
        saved = await r.update_me(r.UserV2UpdateRequest(name='New name', email=''), authorization='test', db=db)
        assert saved.name == 'New name' and saved.email is None
        first = await r.create_address(r.AddressCreateRequest(address='First street 1'), authorization='test', db=db)
        second = await r.create_address(r.AddressCreateRequest(address='Second street 2'), authorization='test', db=db)
        assert first.is_default and not second.is_default
        await r.set_default_address(second.id, authorization='test', db=db)
        listed = await r.list_addresses(authorization='test', db=db)
        assert [a.id for a in listed if a.is_default] == [second.id]
        await r.delete_address(second.id, authorization='test', db=db)
        listed = await r.list_addresses(authorization='test', db=db)
        assert len(listed) == 1 and listed[0].is_default
        foreign = r.UserAddress(user_id='other', address='Private address', is_default=True)
        db.add(foreign)
        await db.commit()
        with pytest.raises(HTTPException) as denied:
            await r.update_address(foreign.id, r.AddressUpdateRequest(address='Changed'), authorization='test', db=db)
        assert denied.value.status_code == 404
        with pytest.raises(HTTPException) as denied:
            await r.delete_address(foreign.id, authorization='test', db=db)
        assert denied.value.status_code == 404
    await engine.dispose()
