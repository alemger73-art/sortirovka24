from fastapi import APIRouter, Depends, Request, HTTPException
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession
from core.database import get_db
from services.payment_providers import configured_adapter
from services.dam_payment_flow import apply_confirmation

router = APIRouter(prefix='/api/v1/dam-alem/payments', tags=['DAM payments'])


@router.get('/capabilities')
async def capabilities():
    # Advertise only capabilities actually available to real customers.
    return {'cash': True, 'kaspi_qr': False, 'halyk_qr': False,
            'message': 'Автоматическая оплата Kaspi/Halyk пока не подключена. Выберите наличные.'}


@router.post('/webhook')
async def webhook(request: Request, db: AsyncSession = Depends(get_db)):
    adapter = configured_adapter()
    body = await request.body()
    if len(body) > 16384:
        raise HTTPException(413, 'Слишком большой запрос')
    try:
        confirmation = adapter.verify(body, request.headers.get('X-Payment-Signature', ''))
    except (ValidationError, ValueError):
        raise HTTPException(422, 'Некорректное событие платежа') from None
    payment = await apply_confirmation(db, confirmation)
    await db.commit()
    return {'id': payment.id, 'status': payment.status}
