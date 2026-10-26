"""«Разместить в Sortirovka Official»: prices for the page, the person's requests, owner settings."""
from __future__ import annotations

import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from services import official_ads as svc
from services.account_session import resolve_account_user
from services.content_access import is_content_admin

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/official-ads", tags=["official-ads"])


class RequestBody(BaseModel):
    body: str = Field(min_length=10, max_length=3500)
    photos: List[str] = []
    phone: Optional[str] = None
    name: Optional[str] = None
    ann_id: Optional[int] = None
    wish: Optional[str] = None


def _phone(raw: str | None) -> str:
    digits = "".join(c for c in (raw or "") if c.isdigit())
    if len(digits) == 10:
        digits = "7" + digits
    if len(digits) == 11 and digits[0] == "8":
        digits = "7" + digits[1:]
    if len(digits) != 11 or digits[0] != "7":
        raise HTTPException(400, "Укажите номер WhatsApp, например +7 700 123 45 67")
    return "+" + digits


def _public(req: dict) -> dict:
    keys = ("id", "created_at", "updated_at", "body", "photos", "ann_id", "wish", "category", "price", "status", "phone")
    out = {k: req.get(k) for k in keys}
    out["pay_link"] = req.get("pay_link") if req.get("status") == "priced" else None
    return out


@router.get("/config")
async def config(db: AsyncSession = Depends(get_db)):
    return svc.public_config(await svc.get_settings(db))


@router.post("/requests", status_code=201)
async def create(body: RequestBody, request: Request,
                 authorization: str | None = Header(default=None, alias="Authorization"),
                 db: AsyncSession = Depends(get_db)):
    from utils.rate_limit import check_ip_rate_limit
    check_ip_rate_limit(request, key_prefix="official_req", window_seconds=3600, max_hits=10)
    user = await resolve_account_user(db, authorization)
    if not user:
        raise HTTPException(401, "Войдите в аккаунт, чтобы отправить заявку")
    cfg = await svc.get_settings(db)
    if not cfg["enabled"]:
        raise HTTPException(409, "Приём заявок временно приостановлен")
    photos = [p.strip() for p in body.photos if isinstance(p, str) and p.strip().startswith("https://")][:10]
    ann_id = body.ann_id
    if ann_id:
        from models.announcements import Announcements
        from services.cabinet_history import owns_content
        ann = await db.get(Announcements, ann_id)
        if not ann or not owns_content(user, ann.user_id, ann.phone):
            ann_id = None
    try:
        req = await svc.create_request(db, user_id=str(user.id), name=(body.name or user.name or "").strip(),
                                       phone=_phone(body.phone or user.phone), body=body.body.strip(), photos=photos,
                                       ann_id=ann_id, wish=body.wish)
    except ValueError as exc:
        raise HTTPException(429, str(exc)) from None
    await svc.send_to_owner(db, req)
    return _public(req)


@router.get("/requests/mine")
async def mine(authorization: str | None = Header(default=None, alias="Authorization"),
               db: AsyncSession = Depends(get_db)):
    user = await resolve_account_user(db, authorization)
    if not user:
        raise HTTPException(401, "Войдите в аккаунт")
    return {"items": [_public(r) for r in await svc.list_for_user(db, str(user.id))]}


async def _admin(authorization: str | None = Header(default=None, alias="Authorization"),
                 db: AsyncSession = Depends(get_db)):
    if not await is_content_admin(db, authorization):
        raise HTTPException(403, "Доступ только для администратора")


@router.get("/admin/settings", dependencies=[Depends(_admin)])
async def admin_settings(db: AsyncSession = Depends(get_db)):
    return await svc.get_settings(db)


@router.put("/admin/settings", dependencies=[Depends(_admin)])
async def admin_save(payload: dict, db: AsyncSession = Depends(get_db)):
    return await svc.save_settings(db, payload)


@router.get("/admin/requests", dependencies=[Depends(_admin)])
async def admin_requests(db: AsyncSession = Depends(get_db)):
    return {"items": await svc.list_all(db)}


class AdminAction(BaseModel):
    action: str
    category: Optional[str] = None


@router.post("/admin/requests/{req_id}", dependencies=[Depends(_admin)])
async def admin_action(req_id: int, body: AdminAction, db: AsyncSession = Depends(get_db)):
    """The same buttons as in Telegram, for the admin panel."""
    codes = {"price": "c", "paid": "p", "published": "d", "reject": "r"}
    if body.action not in codes:
        raise HTTPException(400, "Неизвестное действие")
    answer, req, _ = await svc.decide(db, req_id, codes[body.action], body.category or "")
    if not req:
        raise HTTPException(404, answer)
    return {"answer": answer, "item": req}
