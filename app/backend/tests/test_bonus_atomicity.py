import asyncio
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from core.database import Base
from models.auth import User
from models.user_management import Bonus, UserAction
from services.bonus_ledger import record_bonus
from services.bonus_spending import calculate_bonus_discount


@pytest.mark.asyncio
async def test_concurrent_spending_never_overspends_and_retries_are_idempotent(tmp_path):
    engine = create_async_engine('sqlite+aiosqlite:///' + (tmp_path / 'bonus.db').as_posix())
    maker = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as conn:
        await conn.run_sync(lambda c: Base.metadata.create_all(c, tables=[User.__table__, Bonus.__table__, UserAction.__table__]))
    async with maker() as db:
        db.add(User(id='client', bonus_balance=100))
        await db.commit()
    loaded, ready = 0, asyncio.Event()
    async def spend(order_id):
        nonlocal loaded
        async with maker() as db:
            user = await db.get(User, 'client')
            loaded += 1
            if loaded == 2:
                ready.set()
            await ready.wait()
            try:
                await record_bonus(db, user=user, order_id=order_id, action='spend', points=-80, reason='test')
                await db.commit()
                return order_id
            except HTTPException as exc:
                await db.rollback()
                assert exc.status_code == 409
                return None
    results = await asyncio.gather(spend(1), spend(2))
    winner = next(x for x in results if x is not None)
    assert results.count(None) == 1
    async with maker() as db:
        user = await db.get(User, 'client')
        assert user.bonus_balance == 20
        assert not await record_bonus(db, user=user, order_id=winner, action='spend', points=-80, reason='retry')
        await db.commit()
        assert await db.scalar(select(func.count()).select_from(Bonus)) == 1
        await record_bonus(db, user=user, order_id=winner, action='refund', points=80, reason='test')
        await db.rollback()
        assert (await db.get(User, 'client')).bonus_balance == 20
    await engine.dispose()


def test_non_unit_bonus_exchange_rate_respects_percentage(monkeypatch):
    monkeypatch.setattr('services.bonus_spending.BONUS_TENGE_RATE', 2)
    monkeypatch.setattr('services.bonus_spending.BONUS_MAX_ORDER_PERCENT', 30)
    points, discount = calculate_bonus_discount(user=SimpleNamespace(bonus_balance=1000), subtotal=1000,
        total_before_bonus=1100, bonus_points_requested=1000, has_promo=False)
    assert (points, discount) == (150, 300)


@pytest.mark.asyncio
@pytest.mark.parametrize('points', [float('nan'), float('inf'), 'bad'])
async def test_invalid_bonus_never_reaches_database(points):
    with pytest.raises(HTTPException) as exc:
        await record_bonus(None, user=None, order_id=1, action='spend', points=points, reason='test')
    assert exc.value.status_code == 422
