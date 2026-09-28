"""Atomicity regressions retained against the canonical ledger (not User cache)."""
import asyncio
from decimal import Decimal
import pytest
from fastapi import HTTPException
from sqlalchemy import select, func
from models.user_management import Bonus
from models.food_orders import Food_orders
from services import loyalty as L
from tests.test_loyalty import store, order, credit

@pytest.mark.asyncio
async def test_concurrent_spending_never_overspends_and_retries_are_idempotent(store):
    async with store() as db:
        await credit(db,1000)
        a,b=await order(db,completed=False),await order(db,completed=False)
        for row in (a,b):
            row.bonus_points_used=1000
            row.loyalty_snapshot={**row.loyalty_snapshot,'bonus_spent':'1000.00'}
        ids=[a.id,b.id]
        await db.commit()
    async def spend(oid):
        async with store() as db:
            try:
                row=await db.get(Food_orders,oid)
                await L.spend(db,None,row)
                await db.commit()
                return oid
            except HTTPException as exc:
                await db.rollback()
                assert exc.status_code in (409,422)
                return None
    results=await asyncio.gather(*(spend(i) for i in ids))
    assert results.count(None)==1
    winner=next(i for i in results if i)
    async with store() as db:
        row=await db.get(Food_orders,winner)
        await L.spend(db,None,row)
        assert (await L.account(db,'a')).bonus_balance==0
        assert await db.scalar(select(func.count()).select_from(Bonus).where(Bonus.kind=='SPEND'))==1
        await db.commit()
        await L.restore_spend(db,await L.account(db,'a'),row)
        await db.rollback()
        assert (await L.account(db,'a')).bonus_balance==0

def test_one_bonus_equals_one_tenge_and_server_cap_is_twenty_percent():
    # Old test configured a 2:1 environment rate and 30% limit. Both violate the
    # accepted 1:1 / DB-configured policy; the server must reject excess, not clamp.
    assert L.quote(L.DEFAULTS,1000,200,1000)==(Decimal('200'),Decimal('200'))
    with pytest.raises(HTTPException):L.quote(L.DEFAULTS,1000,201,1000)

@pytest.mark.parametrize('points',[float('nan'),float('inf'),'bad'])
def test_invalid_bonus_never_reaches_database(points):
    with pytest.raises(HTTPException) as exc:L.amount(points)
    assert exc.value.status_code==422
