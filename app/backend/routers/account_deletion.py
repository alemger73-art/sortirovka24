"""In-app/web deletion initiation and private operations queue."""
from datetime import datetime, timedelta, timezone
from typing import Literal

import bcrypt
from core.auth import decode_access_token
from core.database import get_db
from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response
from pydantic import BaseModel, Field, SecretStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.account_deletion import AccountDeletionRequest
from models.auth import User
from models.admin_auth import AdminCredentials
from models.user_management import UserSession
from routers.account_v2 import _assert_panel_admin as _existing_panel_admin
from services.account_session import resolve_account_user
from services.account_deletion import complete_deletion, request_deletion, review_inventory
from utils.rate_limit import check_keyed_rate_limit
from utils.timeutils import as_aware_utc

async def _assert_panel_admin(authorization, db):
    actor, user = await _existing_panel_admin(authorization, db)
    if user is None:
        claims = decode_access_token(authorization.split(" ", 1)[1])
        username = claims.get("username")
        admin = await db.scalar(select(AdminCredentials).where(
            AdminCredentials.username == username, AdminCredentials.is_active.is_(True)))
        if not admin or claims.get("sub") != f"admin:{username}":
            raise HTTPException(401, "Сессия администратора недействительна")
        if admin.updated_at:
            issued = claims.get("iat")
            if not issued or float(issued) < as_aware_utc(admin.updated_at).timestamp():
                raise HTTPException(401, "Войдите в админку заново")
    return actor, user


def no_cache(response: Response):
    response.headers["Cache-Control"] = "no-store"


router = APIRouter(prefix="/api/v1/account-deletion", tags=["account-deletion"], dependencies=[Depends(no_cache)])


class DeletionInput(BaseModel):
    confirmed: Literal[True]
    password: SecretStr | None = Field(None, max_length=128)


class RetainedRecord(BaseModel):
    category: str = Field(min_length=3, max_length=120)
    legal_basis: str = Field(min_length=10, max_length=1000)
    delete_after: str = Field(min_length=10, max_length=200)


class CompletionInput(BaseModel):
    confirmed: Literal[True]
    related_data_processed: Literal[True]
    provider_files_processed: Literal[True]
    backups_and_processors_recorded: Literal[True]
    evidence: str = Field(min_length=30, max_length=4000)
    retained_records: list[RetainedRecord] = Field(max_length=30)


def public_status(row: AccountDeletionRequest | None):
    if not row:
        return {"request": None}
    return {"request": {"id": row.id, "status": row.status,
            "requested_at": row.requested_at, "due_at": row.due_at, "completed_at": row.completed_at}}


async def current_user(db, authorization):
    user = await resolve_account_user(db, authorization)
    if user is None:
        raise HTTPException(401, "Войдите в свой аккаунт.")
    return user


@router.get("/me")
async def deletion_status(authorization: str | None = Header(None), db: AsyncSession = Depends(get_db)):
    user = await current_user(db, authorization)
    row = await db.scalar(select(AccountDeletionRequest).where(AccountDeletionRequest.user_id == user.id))
    return public_status(row)


@router.post("/me", status_code=202)
async def submit_deletion(body: DeletionInput, authorization: str | None = Header(None),
                          db: AsyncSession = Depends(get_db)):
    user = await current_user(db, authorization)
    check_keyed_rate_limit(f"deletion:{user.id}", window_seconds=900, max_hits=5,
                           message="Слишком много попыток. Повторите позже.")
    existing = await db.scalar(select(AccountDeletionRequest).where(AccountDeletionRequest.user_id == user.id))
    if existing:
        return public_status(existing)
    if user.password_hash:
        supplied = body.password.get_secret_value() if body.password else ""
        try:
            valid = bool(supplied) and bcrypt.checkpw(supplied.encode("utf-8"), user.password_hash.encode("utf-8"))
        except ValueError:
            valid = False
        if not valid:
            raise HTTPException(403, "Введите текущий пароль аккаунта.")
    else:
        payload = decode_access_token(authorization.split(" ", 1)[1])
        session = await db.scalar(select(UserSession).where(UserSession.user_id == user.id, UserSession.token_jti == payload.get("jti")))
        created = as_aware_utc(session.created_at) if session else None
        if not created or created < datetime.now(timezone.utc) - timedelta(minutes=10):
            raise HTTPException(403, "Для удаления выйдите из аккаунта и войдите заново через SMS или Google.")
    return public_status(await request_deletion(db, user))


@router.get("/admin")
async def deletion_queue(authorization: str | None = Header(None), limit: int = Query(50, ge=1, le=100),
                         db: AsyncSession = Depends(get_db)):
    await _assert_panel_admin(authorization, db)
    rows = (await db.execute(select(AccountDeletionRequest, User).join(User, User.id == AccountDeletionRequest.user_id)
                             .where(AccountDeletionRequest.status == "pending")
                             .order_by(AccountDeletionRequest.requested_at).limit(limit))).all()
    return {"items": [{**public_status(row)["request"], "user_id": row.user_id,
                       "name": user.name, "phone": user.phone, "email": user.email, "role": user.role}
                      for row, user in rows]}


@router.post("/admin/{request_id}/complete")
async def finish_deletion(request_id: str, body: CompletionInput, authorization: str | None = Header(None),
                          db: AsyncSession = Depends(get_db)):
    actor, actor_user = await _assert_panel_admin(authorization, db)
    if actor_user and actor_user.role not in {"admin", "superadmin"}:
        raise HTTPException(403, "Завершить удаление может только администратор.")
    row = await db.scalar(select(AccountDeletionRequest).where(AccountDeletionRequest.id == request_id).with_for_update())
    if not row:
        raise HTTPException(404, "Заявка не найдена.")
    return public_status(await complete_deletion(db, row, actor=actor, evidence=body.evidence,
                         retained_records=[item.model_dump() for item in body.retained_records]))


@router.get("/admin/{request_id}")
async def deletion_review(request_id: str, authorization: str | None = Header(None), db: AsyncSession = Depends(get_db)):
    await _assert_panel_admin(authorization, db)
    row = await db.get(AccountDeletionRequest, request_id)
    if not row:
        raise HTTPException(404, "Заявка не найдена.")
    user = await db.get(User, row.user_id)
    return {**public_status(row), "inventory": await review_inventory(db, user)}
