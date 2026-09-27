from decimal import Decimal
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field, model_validator
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.food_staff_guard import food_staff
from services.food_shifts import require_partner_shift
from services import food_cashbox as cashbox

router = APIRouter(prefix='/api/v1/dam-alem/cashbox', tags=['DAM cashbox'])


class CashBody(BaseModel):
    id: UUID
    kind: Literal['opening','deposit','expense','withdrawal','correction']
    amount: Decimal = Field(ge=-100000000, le=100000000, max_digits=14, decimal_places=2)
    recipient: str = Field(default='', max_length=200)
    reason: str = Field(min_length=1, max_length=800)
    category: Literal['products','packaging','couriers','salary','rent','other'] = 'other'

    @model_validator(mode='after')
    def valid_amount(self):
        if self.kind == 'opening' and self.amount < 0:
            raise ValueError('Начальный остаток не может быть отрицательным')
        if self.kind not in ('opening','correction') and self.amount <= 0:
            raise ValueError('Укажите положительную сумму')
        if self.kind == 'correction' and self.amount == 0:
            raise ValueError('Укажите ненулевую разницу пересчёта')
        return self


@router.get('')
async def view(db:AsyncSession=Depends(get_db), claims=Depends(food_staff)):
    return await cashbox.snapshot(db)


@router.post('/entries')
async def enter(body:CashBody, db:AsyncSession=Depends(get_db), claims=Depends(food_staff)):
    shift = await require_partner_shift(db, claims)
    row = await cashbox.manual(db, body, claims, shift)
    await db.commit()
    return {'id':row.id}
