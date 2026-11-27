"""The Dam Alem till («Касса Dam Alem») and the site's bonuses: one account per client for both.

The till sends the shared POS_INTEGRATION_KEY; without it, or with the key not set, nothing is answered.
The rules (rate, the share of a bill bonuses may pay, deadlines) are the site's own: services/pos_bonus.py.
"""
import hmac
import os

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from services import pos_bonus

router = APIRouter(prefix="/api/v1/integrations/pos", tags=["pos-integration"])

Phone = Field(min_length=10, max_length=30)
Ref = Field(min_length=2, max_length=80)


class BonusQuery(BaseModel):
    phone: str = Phone


class EarnIn(BaseModel):
    phone: str = Phone
    name: str = Field(default="", max_length=120)
    pos_ref: str = Ref
    number: int = Field(ge=1)
    eligible: int = Field(ge=0, le=10_000_000)   # food after discounts and bonuses, without delivery


class SpendStart(BaseModel):
    phone: str = Phone
    amount: int = Field(gt=0, le=10_000_000)
    food: int = Field(ge=0, le=10_000_000)        # food after discounts: the base of the «up to N%» rule
    pos_ref: str = Ref


class SpendConfirm(BaseModel):
    spend_id: str = Field(min_length=36, max_length=36)
    code: str = Field(min_length=4, max_length=8)
    pos_ref: str = Ref
    number: int = Field(ge=1)


class RestoreIn(BaseModel):
    pos_ref: str = Ref
    number: int = Field(ge=1)


def _cashier(x_api_key: str = Header(default="")) -> None:
    key = os.getenv("POS_INTEGRATION_KEY", "").strip()
    if len(key) < 32 or not hmac.compare_digest(x_api_key.encode(), key.encode()):
        raise HTTPException(401, "Неверный ключ")


@router.post("/bonus", dependencies=[Depends(_cashier)])
async def bonus(body: BonusQuery, db: AsyncSession = Depends(get_db)):
    """Balance and the nearest deadlines, never the history. Unknown phones answer known=false."""
    state = await pos_bonus.balance(db, body.phone)
    await db.commit()   # due bonuses are written off exactly as the client's own cabinet does
    return state


@router.post("/earn", dependencies=[Depends(_cashier)])
async def earn(body: EarnIn, db: AsyncSession = Depends(get_db)):
    result = await pos_bonus.earn(db, phone=body.phone, name=body.name, pos_ref=body.pos_ref, number=body.number, eligible=body.eligible)
    await db.commit()
    result["told"] = await pos_bonus.tell_earned(db, body.phone, body.number, result)
    await db.commit()
    return result


@router.post("/spend/start", dependencies=[Depends(_cashier)])
async def spend_start(body: SpendStart, db: AsyncSession = Depends(get_db)):
    return await pos_bonus.start_spend(db, phone=body.phone, amount=body.amount, food=body.food, pos_ref=body.pos_ref)


@router.post("/spend/confirm", dependencies=[Depends(_cashier)])
async def spend_confirm(body: SpendConfirm, db: AsyncSession = Depends(get_db)):
    result = await pos_bonus.confirm_spend(db, spend_id=body.spend_id, code=body.code, pos_ref=body.pos_ref, number=body.number)
    await db.commit()
    if result.pop("new", False) and not await pos_bonus.opted_out(db, result["phone"]):
        await pos_bonus.send(result["phone"], pos_bonus.spent_text(result["spent"], body.number, result["balance"]))
    result.pop("phone", None)
    await db.commit()
    return result


@router.post("/restore", dependencies=[Depends(_cashier)])
async def restore(body: RestoreIn, db: AsyncSession = Depends(get_db)):
    result = await pos_bonus.restore(db, pos_ref=body.pos_ref, number=body.number)
    await db.commit()
    return result
