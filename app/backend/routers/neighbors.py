"""«Мой дом»: neighbours of one house — address, confirmation, house feed with comments and «У меня тоже»."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from services import neighbors as svc
from services.account_session import resolve_account_user
from services.content_access import is_content_admin

router = APIRouter(prefix="/api/v1/neighbors", tags=["neighbors"])
Auth = Header(default=None, alias="Authorization")


class AddressBody(BaseModel):
    kind: str = "flat"
    street: str = ""
    house: str = ""
    entrance: str | int | None = None
    flat: str = ""
    display_name: str = ""
    anonymous: bool = False
    consent: bool = False


class ProofBody(BaseModel):
    image: str


class PostBody(BaseModel):
    kind: str
    body: str
    only_entrance: bool = False


class CommentBody(BaseModel):
    body: str


class ReportBody(BaseModel):
    target: str
    id: int


def _fail(exc: Exception):
    if isinstance(exc, LookupError):
        raise HTTPException(404, str(exc)) from None
    if isinstance(exc, PermissionError):
        raise HTTPException(403, str(exc)) from None
    raise HTTPException(400, str(exc)) from None


async def _user(db, authorization):
    user = await resolve_account_user(db, authorization)
    if not user:
        raise HTTPException(401, "Войдите в аккаунт")
    return user


async def _member(db, authorization, confirmed: bool = False) -> dict:
    user = await _user(db, authorization)
    m = await svc.member_of(db, str(user.id))
    if not m:
        raise HTTPException(409, "Сначала укажите свой адрес")
    if confirmed and m["status"] != "confirmed":
        raise HTTPException(403, "Писать можно после подтверждения адреса")
    return m


def _me(m: dict) -> dict:
    keys = ("id", "kind", "street", "house", "entrance", "flat", "display_name", "anonymous", "status", "role", "custom_street")
    return {k: m.get(k) for k in keys} | {"anonymous": bool(m.get("anonymous")), "title": svc.building_title(m),
                                          "public_name": svc.public_name(m)}


@router.get("/streets")
async def streets(db: AsyncSession = Depends(get_db)):
    return {"streets": list(svc.STREETS), "stats": await svc.district_stats(db)}


@router.get("/me")
async def me(authorization: str | None = Auth, db: AsyncSession = Depends(get_db)):
    user = await _user(db, authorization)
    m = await svc.member_of(db, str(user.id))
    if not m:
        first = (getattr(user, "name", "") or "").split(" ")[0]
        return {"member": None, "suggested_name": first[:30]}
    return {"member": _me(m), "confirm": await svc.confirm_state(db, m)}


@router.put("/me")
async def save(body: AddressBody, request: Request, authorization: str | None = Auth, db: AsyncSession = Depends(get_db)):
    from utils.rate_limit import check_ip_rate_limit
    check_ip_rate_limit(request, key_prefix="nb_address", window_seconds=3600, max_hits=20)
    user = await _user(db, authorization)
    try:
        data = svc.clean_address(body.model_dump(), getattr(user, "name", "") or "")
    except ValueError as exc:
        _fail(exc)
    m = await svc.save_address(db, str(user.id), data)
    return {"member": _me(m), "confirm": await svc.confirm_state(db, m)}


@router.delete("/me")
async def leave(authorization: str | None = Auth, db: AsyncSession = Depends(get_db)):
    user = await _user(db, authorization)
    await svc.leave(db, str(user.id))
    return {"ok": True}


@router.post("/me/proof")
async def proof(body: ProofBody, request: Request, authorization: str | None = Auth, db: AsyncSession = Depends(get_db)):
    from utils.rate_limit import check_ip_rate_limit
    check_ip_rate_limit(request, key_prefix="nb_proof", window_seconds=3600, max_hits=6)
    m = await _member(db, authorization)
    if m["status"] == "confirmed":
        return {"member": _me(m), "confirm": await svc.confirm_state(db, m)}
    try:
        m = await svc.save_proof(db, m, body.image)
    except ValueError as exc:
        _fail(exc)
    return {"member": _me(m), "confirm": await svc.confirm_state(db, m)}


@router.get("/house")
async def house(authorization: str | None = Auth, db: AsyncSession = Depends(get_db)):
    m = await _member(db, authorization)
    if m["status"] != "confirmed":
        return {"people": [], "waiting": [], "entrances": {}, "total": await svc.confirmed_count(db, m["building"]), "locked": True}
    return await svc.neighbours(db, m) | {"locked": False}


@router.post("/confirm/{member_id}")
async def confirm(member_id: int, authorization: str | None = Auth, db: AsyncSession = Depends(get_db)):
    m = await _member(db, authorization, confirmed=True)
    try:
        return await svc.confirm_neighbour(db, m, member_id)
    except (LookupError, PermissionError) as exc:
        _fail(exc)


@router.get("/feed")
async def feed(before: str = "", kind: str = "", entrance: bool = False, authorization: str | None = Auth,
               db: AsyncSession = Depends(get_db)):
    m = await _member(db, authorization)
    return await svc.feed(db, m, before=before[:40], kind=kind, my_entrance=entrance)


@router.post("/posts", status_code=201)
async def create_post(body: PostBody, authorization: str | None = Auth, db: AsyncSession = Depends(get_db)):
    m = await _member(db, authorization, confirmed=True)
    try:
        return await svc.create_post(db, m, body.kind, body.body, body.only_entrance)
    except (ValueError, PermissionError) as exc:
        _fail(exc)


@router.get("/posts/{post_id}")
async def post(post_id: int, authorization: str | None = Auth, db: AsyncSession = Depends(get_db)):
    m = await _member(db, authorization)
    try:
        return await svc.post_detail(db, m, post_id)
    except LookupError as exc:
        _fail(exc)


@router.delete("/posts/{post_id}")
async def delete_post(post_id: int, authorization: str | None = Auth, db: AsyncSession = Depends(get_db)):
    m = await _member(db, authorization, confirmed=True)
    try:
        await svc.delete_post(db, m, post_id)
    except (LookupError, PermissionError) as exc:
        _fail(exc)
    return {"ok": True}


@router.post("/posts/{post_id}/comments")
async def comment(post_id: int, body: CommentBody, authorization: str | None = Auth, db: AsyncSession = Depends(get_db)):
    m = await _member(db, authorization, confirmed=True)
    try:
        return await svc.add_comment(db, m, post_id, body.body)
    except (ValueError, LookupError, PermissionError) as exc:
        _fail(exc)


@router.delete("/comments/{comment_id}")
async def delete_comment(comment_id: int, authorization: str | None = Auth, db: AsyncSession = Depends(get_db)):
    m = await _member(db, authorization, confirmed=True)
    try:
        await svc.delete_comment(db, m, comment_id)
    except (LookupError, PermissionError) as exc:
        _fail(exc)
    return {"ok": True}


@router.post("/posts/{post_id}/metoo")
async def me_too(post_id: int, authorization: str | None = Auth, db: AsyncSession = Depends(get_db)):
    m = await _member(db, authorization, confirmed=True)
    try:
        return await svc.toggle_me_too(db, m, post_id)
    except LookupError as exc:
        _fail(exc)


@router.post("/posts/{post_id}/pin")
async def pin(post_id: int, authorization: str | None = Auth, db: AsyncSession = Depends(get_db)):
    m = await _member(db, authorization, confirmed=True)
    try:
        return await svc.pin_post(db, m, post_id)
    except (LookupError, PermissionError) as exc:
        _fail(exc)


@router.post("/report")
async def report(body: ReportBody, authorization: str | None = Auth, db: AsyncSession = Depends(get_db)):
    m = await _member(db, authorization, confirmed=True)
    try:
        return await svc.report(db, m, body.target, body.id)
    except (ValueError, LookupError, PermissionError) as exc:
        _fail(exc)


# ---------------- admin ----------------
async def _admin(authorization: str | None = Auth, db: AsyncSession = Depends(get_db)):
    if not await is_content_admin(db, authorization):
        raise HTTPException(403, "Доступ только для администратора")


@router.get("/admin", dependencies=[Depends(_admin)])
async def admin_overview(db: AsyncSession = Depends(get_db)):
    return await svc.admin_overview(db)


@router.get("/admin/house", dependencies=[Depends(_admin)])
async def admin_house(building: str, db: AsyncSession = Depends(get_db)):
    return {"items": await svc.admin_members(db, building)}


@router.get("/admin/proof/{member_id}", dependencies=[Depends(_admin)])
async def admin_proof(member_id: int, db: AsyncSession = Depends(get_db)):
    return {"image": await svc.admin_proof(db, member_id)}


class Decision(BaseModel):
    approve: bool


@router.post("/admin/proof/{member_id}", dependencies=[Depends(_admin)])
async def admin_decide(member_id: int, body: Decision, db: AsyncSession = Depends(get_db)):
    answer, _ = await svc.decide_proof(db, member_id, body.approve)
    return {"answer": answer}


class RoleBody(BaseModel):
    role: str


@router.post("/admin/members/{member_id}/role", dependencies=[Depends(_admin)])
async def admin_role(member_id: int, body: RoleBody, db: AsyncSession = Depends(get_db)):
    try:
        m = await svc.admin_set_role(db, member_id, body.role)
    except ValueError as exc:
        _fail(exc)
    return {"ok": bool(m)}


class RestoreBody(BaseModel):
    target: str
    id: int
    keep: bool


@router.post("/admin/moderate", dependencies=[Depends(_admin)])
async def admin_moderate(body: RestoreBody, db: AsyncSession = Depends(get_db)):
    if body.target not in ("post", "comment"):
        raise HTTPException(400, "Неизвестная цель")
    await svc.admin_restore(db, body.target, body.id, body.keep)
    return {"ok": True}
