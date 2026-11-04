"""Kaspi payments through ApiPay: the price of «Поднять» and the signed payment webhook (services/paid_boost.py)."""
import json
import logging

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from services import apipay, paid_boost

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/payments", tags=["payments"])


@router.get("/boost-price")
async def boost_price():
    """`paid` is false while Kaspi payments are not switched on: «Поднять» is free then."""
    return {"paid": paid_boost.paid(), "price": paid_boost.price(), "days": paid_boost.BOOST_DAYS}


@router.post("/apipay/webhook")
async def apipay_webhook(request: Request, signature: str | None = Header(default=None, alias="X-Webhook-Signature"),
                         db: AsyncSession = Depends(get_db)):
    raw = await request.body()
    if not apipay.valid_signature(raw, signature):
        raise HTTPException(401, "bad signature")
    try:
        payload = json.loads(raw)
    except ValueError as exc:
        raise HTTPException(400, "bad json") from exc
    if payload.get("is_sandbox") and not paid_boost.sandbox_allowed():
        return {"ok": True, "result": "sandbox ignored"}
    result = await paid_boost.handle_webhook(db, payload)
    logger.info("[ApiPay] webhook %s → %s", (payload.get("invoice") or {}).get("external_order_id"), result)
    return {"ok": True, "result": result}
