import asyncio
from types import SimpleNamespace
from sqlalchemy import Column, Integer, String
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import declarative_base
from services.cabinet_history import list_owned_history, owns_content, legacy_food_id

Base = declarative_base()
class Entry(Base):
    __tablename__ = 'history_test'
    id = Column(Integer, primary_key=True)
    user_id = Column(String)
    phone = Column(String)

def test_owned_history_is_not_hidden_by_500_other_customers():
    async def run():
        engine = create_async_engine('sqlite+aiosqlite:///:memory:')
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        user = SimpleNamespace(id='mine', phone='+77011234567')
        async with AsyncSession(engine) as db:
            db.add_all([Entry(id=1, user_id='mine', phone=''), Entry(id=2, phone='8 (701) 123-45-67'), Entry(id=3, user_id='someone-else', phone=user.phone)])
            db.add_all([Entry(id=i, phone='+77019999999') for i in range(4, 610)])
            await db.commit()
            rows = await list_owned_history(db, Entry, user)
            assert [r.id for r in rows] == [2, 1]
            assert [r.id for r in await list_owned_history(db, Entry, user, limit=1)] == [2]
        await engine.dispose()
    asyncio.run(run())

def test_account_id_wins_over_matching_phone():
    user = SimpleNamespace(id='mine', phone='+77011234567')
    assert owns_content(user, 'mine', None)
    assert owns_content(user, None, '87011234567')
    assert not owns_content(user, 'other', user.phone)
    assert not owns_content(user, None, '')

def test_legacy_food_reference_keeps_detailed_order():
    assert legacy_food_id(SimpleNamespace(order_type='food', details='Доставка — заказ # 42')) == 42
    assert legacy_food_id(SimpleNamespace(order_type='store', details='#42')) is None
    assert legacy_food_id(SimpleNamespace(order_type='food', details='без номера')) is None
