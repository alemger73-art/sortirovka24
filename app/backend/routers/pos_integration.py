"""The Dam Alem cashier («Касса Dam Alem») asks the site about a client's bonuses by phone. Read only.

The cashier sends the shared POS_INTEGRATION_KEY; without it, or with the key not set, nothing is answered.
"""
import hmac
import os
from decimal import Decimal

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from services import loyalty
from services.bonus_rewards import find_user_by_phone

router = APIRouter(prefix="/api/v1/integrations/pos", tags=["pos-integration"])


class BonusQuery(BaseModel):
    phone: str = Field(min_length=10, max_length=30)


def _cashier(x_api_key: str = Header(default="")) -> None:
    key = os.getenv("POS_INTEGRATION_KEY", "").strip()
    if len(key) < 32 or not hmac.compare_digest(x_api_key.encode(), key.encode()):
        raise HTTPException(401, "Неверный ключ")


def _tenge(value) -> int:
    return int(Decimal(str(value or 0)))


@router.post("/bonus", dependencies=[Depends(_cashier)])
async def bonus(body: BonusQuery, db: AsyncSession = Depends(get_db)):
    """{"registered": false} for a phone without a verified account; otherwise the DAM ALEM balance and what expires when."""
    user = await find_user_by_phone(db, body.phone)
    if user is None:
        return {"registered": False}
    state = await loyalty.summary(db, user.id)
    await db.commit()  # summary settles expired bonuses, exactly as the client's own cabinet does
    return {"registered": True, "balance": _tenge(state["balance"]),
            "expires": [{"amount": _tenge(e["amount"]), "at": e["at"]} for e in state.get("expires", [])][:3]}
