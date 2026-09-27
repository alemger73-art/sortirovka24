"""Public partner pages and admin-only editorial publishing."""
from datetime import datetime, timezone
import re
from typing import Literal
from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.admin_guard import require_panel_admin
from core.database import get_db
from models.partner_profiles import PartnerShowcase
from services.module_settings import require_module
from utils.phone import normalize_phone

router = APIRouter(prefix="/api/v1/partners", tags=["partner profiles"],
                   dependencies=[Depends(require_module("business"))])


def safe_link(value: str) -> str:
    if not value:
        return value
    url = urlsplit(value)
    if url.scheme != "https" or not url.hostname or url.username or url.password:
        raise ValueError("Укажите HTTPS-ссылку без логина и пароля")
    return value


class Work(BaseModel):
    title: str = Field(min_length=2, max_length=160)
    image: str = Field(max_length=2048)
    source: str = Field(default="", max_length=2048)
    kind: Literal["photo", "video"] = "photo"
    caption: str = Field(default="", max_length=500)

    @field_validator("source")
    @classmethod
    def valid_source(cls, value):
        return safe_link(value)


class Profile(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    slug: str = Field(pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$", max_length=80)
    name: str = Field(min_length=2, max_length=120)
    category: str = Field(min_length=2, max_length=80)
    headline: str = Field(min_length=2, max_length=180)
    description: str = Field(min_length=10, max_length=5000)
    logo: str = Field(default="", max_length=2048)
    cover: str = Field(default="", max_length=2048)
    phone: str = Field(default="", max_length=32)
    whatsapp: str = Field(default="", max_length=32)
    instagram: str = Field(default="", max_length=2048)
    address: str = Field(default="", max_length=250)
    area: str = Field(default="", max_length=250)
    hours: str = Field(default="", max_length=120)
    offer: str = Field(default="", max_length=300)
    offer_terms: str = Field(default="", max_length=500)
    services: list[str] = Field(default_factory=list, max_length=20)
    works: list[Work] = Field(default_factory=list, max_length=12)
    published: bool = False

    @field_validator("instagram")
    @classmethod
    def valid_instagram(cls, value):
        return safe_link(value)

    @field_validator("phone", "whatsapp")
    @classmethod
    def valid_phone(cls, value):
        if not value:
            return ""
        normalized = normalize_phone(value)
        if not re.fullmatch(r"\+7[0-9]{10}", normalized) or re.search(r"[^+0-9\s()\-]", value):
            raise ValueError("Проверьте номер телефона")
        return normalized

    @field_validator("services")
    @classmethod
    def valid_services(cls, values):
        if any(not v.strip() or len(v) > 200 for v in values):
            raise ValueError("Услуга должна содержать от 1 до 200 символов")
        return list(dict.fromkeys(v.strip() for v in values))

    @model_validator(mode="after")
    def publishable(self):
        if self.published and not (self.phone or self.whatsapp or self.instagram):
            raise ValueError("Для публикации нужен контакт компании")
        for value in [self.logo, self.cover, *(w.image for w in self.works)]:
            if value and (value.startswith("//") or "\\" in value or ":" in value and not value.startswith("https://")):
                raise ValueError("Недопустимый адрес изображения")
        return self


def payload(row: PartnerShowcase) -> dict:
    return {**row.content, "slug": row.slug, "published": row.published}


@router.get("/admin", dependencies=[Depends(require_panel_admin)])
async def admin_list(db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(PartnerShowcase).order_by(PartnerShowcase.slug))).scalars().all()
    return {"items": [payload(row) for row in rows]}


@router.put("/admin/{slug}", dependencies=[Depends(require_panel_admin)], response_model=Profile)
async def save_profile(slug: str, body: Profile, db: AsyncSession = Depends(get_db)):
    if slug != body.slug:
        raise HTTPException(400, "Адрес страницы не совпадает")
    row = await db.get(PartnerShowcase, slug)
    if row is None:
        row = PartnerShowcase(slug=slug)
        db.add(row)
    row.content = body.model_dump(exclude={"slug", "published"})
    row.published = body.published
    row.updated_at = datetime.now(timezone.utc)
    await db.commit()
    return body


@router.get("")
async def public_list(db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(PartnerShowcase).where(PartnerShowcase.published.is_(True))
                            .order_by(PartnerShowcase.slug))).scalars().all()
    return {"items": [payload(row) for row in rows]}


@router.get("/{slug}", response_model=Profile)
async def public_profile(slug: str, db: AsyncSession = Depends(get_db)):
    row = await db.get(PartnerShowcase, slug)
    if row is None or not row.published:
        raise HTTPException(404, "Компания не найдена")
    return payload(row)
