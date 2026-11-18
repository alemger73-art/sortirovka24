"""«Полезно знать»: public cards with a poll; editors save cards from the admin panel."""
from __future__ import annotations

import re
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.ext.asyncio import AsyncSession

from core.admin_guard import require_panel_admin
from core.database import get_db
from services import useful as svc
from services.account_session import resolve_account_user

router = APIRouter(prefix="/api/v1/useful", tags=["useful"])
Auth = Header(default=None, alias="Authorization")
SLUG = re.compile(r"^[a-z0-9][a-z0-9-]{1,78}$")


class Phone(BaseModel):
    number: str = Field(min_length=2, max_length=20)
    label: str = Field(min_length=2, max_length=40)


class Source(BaseModel):
    title: str = Field(min_length=3, max_length=160)
    url: str = Field(default="", max_length=400)


class Poll(BaseModel):
    question: str = Field(min_length=3, max_length=160)
    options: list[str] = Field(min_length=2, max_length=5)


class Card(BaseModel):
    title: str = Field(min_length=5, max_length=160)
    summary: str = Field(default="", max_length=300)
    badge: str = Field(default="", max_length=40)          # «с 21 ноября»
    category: str = Field(default="", max_length=40)       # «Дети и школа», «Выплаты»…
    image_url: str = Field(default="", max_length=400)
    changes: list[str] = Field(min_length=1, max_length=8)
    actions: list[str] = Field(default_factory=list, max_length=8)
    phones: list[Phone] = Field(default_factory=list, max_length=4)
    source: Optional[Source] = None
    poll: Optional[Poll] = None

    @field_validator("changes", "actions")
    @classmethod
    def lines(cls, value: list[str]) -> list[str]:
        cleaned = [v.strip() for v in value if v and v.strip()]
        if any(len(v) > 400 for v in cleaned):
            raise ValueError("Пункт длиннее 400 символов")
        return cleaned


class SaveBody(BaseModel):
    card: Card
    published: bool = False


class VoteBody(BaseModel):
    choice: int


async def _user_id(db, authorization) -> Optional[str]:
    user = await resolve_account_user(db, authorization)
    return str(user.id) if user else None


@router.get("")
async def cards(db: AsyncSession = Depends(get_db)):
    return {"items": [svc.teaser(c) for c in await svc.listing(db)]}


@router.get("/admin", dependencies=[Depends(require_panel_admin)])
async def admin_cards(db: AsyncSession = Depends(get_db)):
    return {"items": await svc.listing(db, include_drafts=True)}


@router.put("/admin/{slug}", dependencies=[Depends(require_panel_admin)])
async def save_card(slug: str, body: SaveBody, db: AsyncSession = Depends(get_db)):
    if not SLUG.match(slug):
        raise HTTPException(422, "Адрес карточки: латиница, цифры и дефис")
    return await svc.save(db, slug, body.card.model_dump(), body.published)


@router.get("/{slug}")
async def card(slug: str, authorization: str | None = Auth, db: AsyncSession = Depends(get_db)):
    found = await svc.get(db, slug)
    if not found:
        raise HTTPException(404, "Карточка не найдена")
    return svc.public(found, await svc.poll_results(db, found, await _user_id(db, authorization)))


@router.post("/{slug}/vote")
async def vote(slug: str, body: VoteBody, authorization: str | None = Auth, db: AsyncSession = Depends(get_db)):
    found = await svc.get(db, slug)
    if not found:
        raise HTTPException(404, "Карточка не найдена")
    user_id = await _user_id(db, authorization)
    if not user_id:
        raise HTTPException(401, "Войдите, чтобы проголосовать")
    try:
        return await svc.vote(db, found, user_id, body.choice)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from None
