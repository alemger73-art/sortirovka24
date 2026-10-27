"""«Шақыру»: electronic invitations to a той — builder for the host, public page and answers for guests."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from services import toy_invites as svc
from services.account_session import resolve_account_user
from services.content_access import is_content_admin

router = APIRouter(prefix="/api/v1/toy", tags=["toy-invites"])


class InviteBody(BaseModel):
    data: dict


class RsvpBody(BaseModel):
    visitor: Optional[str] = None
    name: str
    coming: bool = True
    guests: int = 1
    wish: str = ""


def _phone(raw: str | None) -> str:
    digits = "".join(c for c in (raw or "") if c.isdigit())
    if len(digits) == 11 and digits[0] == "8":
        digits = "7" + digits[1:]
    return "+" + digits if len(digits) == 11 and digits[0] == "7" else ""


async def _user(db, authorization):
    user = await resolve_account_user(db, authorization)
    if not user:
        raise HTTPException(401, "Войдите в аккаунт")
    return user


async def _own(db, invite_id: int, authorization) -> dict:
    user = await _user(db, authorization)
    inv = await svc.get_invite(db, invite_id)
    if not inv or str(inv.get("user_id")) != str(user.id) or inv["status"] == "archived":
        raise HTTPException(404, "Приглашение не найдено")
    return inv


def _for_owner(inv: dict) -> dict:
    keys = ("id", "slug", "status", "data", "price", "views", "created_at", "updated_at", "paid_at")
    return {k: inv.get(k) for k in keys} | {"link": svc.link_for(inv)}


@router.get("/config")
async def config(db: AsyncSession = Depends(get_db)):
    cfg = await svc.get_settings(db)
    return {"enabled": cfg["enabled"], "price": cfg["price"]}


@router.post("/invites", status_code=201)
async def create(body: InviteBody, authorization: str | None = Header(default=None, alias="Authorization"),
                 db: AsyncSession = Depends(get_db)):
    user = await _user(db, authorization)
    try:
        data = svc.clean_data(body.data)
        inv = await svc.create(db, user_id=str(user.id), phone=_phone(user.phone), data=data)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from None
    return _for_owner(inv)


@router.get("/invites/mine")
async def mine(authorization: str | None = Header(default=None, alias="Authorization"), db: AsyncSession = Depends(get_db)):
    user = await _user(db, authorization)
    items = []
    for inv in await svc.list_for_user(db, str(user.id)):
        summary = await svc.guests(db, inv["id"])
        items.append(_for_owner(inv) | {"guests": {k: summary[k] for k in ("coming", "people", "declined")}})
    return {"items": items}


@router.get("/invites/{invite_id}")
async def get_one(invite_id: int, authorization: str | None = Header(default=None, alias="Authorization"),
                  db: AsyncSession = Depends(get_db)):
    return _for_owner(await _own(db, invite_id, authorization))


@router.put("/invites/{invite_id}")
async def update(invite_id: int, body: InviteBody, authorization: str | None = Header(default=None, alias="Authorization"),
                 db: AsyncSession = Depends(get_db)):
    inv = await _own(db, invite_id, authorization)
    try:
        data = svc.clean_data(body.data)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from None
    return _for_owner(await svc.update_data(db, inv["id"], data))


@router.delete("/invites/{invite_id}")
async def remove(invite_id: int, authorization: str | None = Header(default=None, alias="Authorization"),
                 db: AsyncSession = Depends(get_db)):
    inv = await _own(db, invite_id, authorization)
    await svc.set_status(db, inv["id"], "archived")
    return {"ok": True}


@router.post("/invites/{invite_id}/publish")
async def publish(invite_id: int, request: Request, authorization: str | None = Header(default=None, alias="Authorization"),
                  db: AsyncSession = Depends(get_db)):
    from utils.rate_limit import check_ip_rate_limit
    check_ip_rate_limit(request, key_prefix="toy_publish", window_seconds=3600, max_hits=10)
    inv = await _own(db, invite_id, authorization)
    cfg = await svc.get_settings(db)
    if not cfg["enabled"]:
        raise HTTPException(409, "Приём заказов временно приостановлен")
    if inv["status"] == "published":
        return _for_owner(inv)
    if not inv.get("phone"):
        raise HTTPException(400, "Добавьте номер телефона в профиле — на него придёт ссылка на оплату")
    return _for_owner(await svc.request_payment(db, inv))


@router.get("/invites/{invite_id}/guests")
async def guest_list(invite_id: int, authorization: str | None = Header(default=None, alias="Authorization"),
                     db: AsyncSession = Depends(get_db)):
    inv = await _own(db, invite_id, authorization)
    return await svc.guests(db, inv["id"])


@router.get("/public/{slug}")
async def public(slug: str, authorization: str | None = Header(default=None, alias="Authorization"),
                 db: AsyncSession = Depends(get_db)):
    inv = await svc.get_by_slug(db, slug)
    user = await resolve_account_user(db, authorization) if inv else None
    owner = bool(user and inv and str(inv.get("user_id")) == str(user.id))
    if not inv or inv["status"] == "archived" or (inv["status"] != "published" and not owner):
        raise HTTPException(404, "Приглашение не найдено или ещё не опубликовано")
    if not owner:
        await svc.add_view(db, inv["id"])
    return {"slug": inv["slug"], "data": inv["data"], "status": inv["status"], "preview": inv["status"] != "published", "owner": owner}


@router.post("/public/{slug}/rsvp")
async def rsvp(slug: str, body: RsvpBody, request: Request, db: AsyncSession = Depends(get_db)):
    from utils.rate_limit import check_ip_rate_limit
    from services import ad_stats
    check_ip_rate_limit(request, key_prefix="toy_rsvp", window_seconds=3600, max_hits=30)
    inv = await svc.get_by_slug(db, slug)
    if not inv or inv["status"] != "published":
        raise HTTPException(404, "Приглашение не найдено")
    name = " ".join(body.name.split())[:80]
    if len(name) < 2:
        raise HTTPException(400, "Напишите ваше имя")
    ip = request.headers.get("x-forwarded-for", "").split(",")[0].strip() or (request.client.host if request.client else "")
    visitor = ad_stats.visitor_key(body.visitor, ip, request.headers.get("user-agent", ""))
    return await svc.save_rsvp(db, inv["id"], visitor, name, body.coming, body.guests, body.wish.strip())


# ---------------- admin ----------------
async def _admin(authorization: str | None = Header(default=None, alias="Authorization"), db: AsyncSession = Depends(get_db)):
    if not await is_content_admin(db, authorization):
        raise HTTPException(403, "Доступ только для администратора")


@router.get("/admin/settings", dependencies=[Depends(_admin)])
async def admin_settings(db: AsyncSession = Depends(get_db)):
    return await svc.get_settings(db)


@router.put("/admin/settings", dependencies=[Depends(_admin)])
async def admin_save(payload: dict, db: AsyncSession = Depends(get_db)):
    return await svc.save_settings(db, payload)


@router.get("/admin/invites", dependencies=[Depends(_admin)])
async def admin_list(db: AsyncSession = Depends(get_db)):
    return {"items": [_for_owner(i) | {"phone": i.get("phone")} for i in await svc.list_all(db)]}


class AdminAction(BaseModel):
    action: str


@router.post("/admin/invites/{invite_id}", dependencies=[Depends(_admin)])
async def admin_action(invite_id: int, body: AdminAction, db: AsyncSession = Depends(get_db)):
    if body.action not in ("paid", "reject"):
        raise HTTPException(400, "Неизвестное действие")
    answer, inv = await svc.decide(db, invite_id, body.action == "paid")
    if not inv:
        raise HTTPException(404, answer)
    return {"answer": answer, "item": _for_owner(inv)}
