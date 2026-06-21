"""Public business partner application form."""

import logging
from datetime import datetime, timezone

from core.database import get_db
from fastapi import APIRouter, Depends, HTTPException, Request
from models.business_partner_requests import Business_partner_requests
from pydantic import BaseModel, Field
from services.telegram import notify_new_business_partner
from sqlalchemy.ext.asyncio import AsyncSession
from utils.phone import normalize_phone
from utils.rate_limit import check_ip_rate_limit

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/business", tags=["business"])


class BusinessApplyRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    phone: str = Field(..., min_length=10, max_length=32)
    whatsapp: str | None = Field(default=None, max_length=32)
    activity: str = Field(..., min_length=2, max_length=64)
    description: str | None = Field(default=None, max_length=2000)


class BusinessApplyResponse(BaseModel):
    success: bool
    message: str
    id: int | None = None


@router.post("/apply", response_model=BusinessApplyResponse)
async def apply_for_partnership(
    body: BusinessApplyRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    check_ip_rate_limit(
        request,
        key_prefix="business_apply",
        max_hits=5,
        window_seconds=3600,
        message="Слишком много заявок с вашего IP. Попробуйте позже.",
    )

    phone = normalize_phone(body.phone)
    if not phone:
        raise HTTPException(status_code=400, detail="Invalid phone")

    whatsapp = normalize_phone(body.whatsapp) if body.whatsapp else None
    now = datetime.now(timezone.utc).isoformat()

    row = Business_partner_requests(
        name=body.name.strip(),
        phone=phone,
        whatsapp=whatsapp,
        activity=body.activity.strip(),
        description=(body.description or "").strip() or None,
        status="new",
        created_at=now,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)

    payload = {
        "id": row.id,
        "name": row.name,
        "phone": row.phone,
        "whatsapp": row.whatsapp or row.phone,
        "activity": row.activity,
        "description": row.description or "",
    }

    try:
        await notify_new_business_partner(payload)
    except Exception as exc:
        logger.warning("Business partner Telegram notify failed: %s", exc)

    return BusinessApplyResponse(
        success=True,
        message="Заявка принята. Мы свяжемся с вами в ближайшее время.",
        id=row.id,
    )
