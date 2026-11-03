"""Partner shops: public catalog and order form, owner-only setup (see services/partner_shop.py)."""
from typing import Any, Literal, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Path
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from services import partner_shop as svc
from services import partner_shop_cabinet as cabinet
from services.content_access import is_owner_admin
from services.module_settings import require_module

router = APIRouter(prefix="/api/v1/shops", tags=["partner shops"], dependencies=[Depends(require_module("business"))])
Slug = Path(pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$", max_length=80)


async def owner(authorization: Optional[str] = Header(default=None, alias="Authorization"), db: AsyncSession = Depends(get_db)):
    if not await is_owner_admin(db, authorization):
        raise HTTPException(403, "Доступ только для администратора")


class OrderLine(BaseModel):
    sku: str = Field(max_length=40)
    qty: int


class OrderBody(BaseModel):
    model_config = ConfigDict(extra="ignore")
    name: str = Field(max_length=200)
    phone: str = Field(max_length=40)
    address: str = Field(max_length=400)
    zone: str = Field(default="", max_length=200)
    wanted: str = Field(default="", max_length=200)
    comment: str = Field(default="", max_length=600)
    items: list[OrderLine] = Field(max_length=50)


class Zone(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    price: str = Field(default="", max_length=80)


class ShopSettings(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    enabled: bool = False
    name: str = Field(min_length=2, max_length=120)
    headline: str = Field(default="", max_length=200)
    logo: str = Field(default="", max_length=300)
    accent: str = Field(default="#2f5a34", pattern=r"^#[0-9a-fA-F]{6}$")
    hours: str = Field(default="", max_length=80)
    phone: str = Field(default="", max_length=20)
    whatsapp: str = Field(default="", max_length=20)
    instagram: str = Field(default="", max_length=300)
    delivery: list[Zone] = Field(default_factory=list, max_length=20)
    delivery_note: str = Field(default="", max_length=300)
    min_order: int = Field(default=0, ge=0, le=1_000_000)
    categories: list[str] = Field(default_factory=list, max_length=30)


class Product(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    sku: str = Field(min_length=1, max_length=40)
    category: str = Field(min_length=1, max_length=80)
    name: str = Field(min_length=2, max_length=200)
    kind: Optional[str] = Field(default=None, max_length=80)
    height_cm: Optional[int] = Field(default=None, ge=1, le=1000)
    pot_cm: Optional[int] = Field(default=None, ge=1, le=300)
    price: int = Field(ge=1, le=10_000_000)
    image: Optional[str] = Field(default=None, max_length=300, pattern=r"^/[A-Za-z0-9/_.\-]+$")
    description: Optional[str] = Field(default=None, max_length=600)
    light: Optional[Literal["bright", "diffused", "partial"]] = None
    water: Optional[Literal["rare", "moderate", "often"]] = None
    easy: bool = False


class CabinetLogin(BaseModel):
    code: str = Field(min_length=10, max_length=60)


class ProductChange(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    price: Optional[int] = Field(default=None, ge=1, le=10_000_000)
    active: Optional[bool] = None
    description: Optional[str] = Field(default=None, max_length=600)


class StatusChange(BaseModel):
    status: Literal["new", "accepted", "done", "cancelled"]


@router.get("")
async def shops(db: AsyncSession = Depends(get_db)):
    return {"items": await svc.enabled_shops(db)}


@router.get("/{slug}")
async def storefront(slug: str, db: AsyncSession = Depends(get_db)):
    return await svc.storefront(db, slug)


@router.post("/{slug}/orders", status_code=201)
async def order(slug: str, body: OrderBody, db: AsyncSession = Depends(get_db),
                authorization: Optional[str] = Header(default=None, alias="Authorization")):
    """A signed-in resident's order also lands in the order history of their personal cabinet."""
    from services.store_order_account import optional_account_user, user_id_for_order
    user = await optional_account_user(db, authorization)
    return await svc.place_order(db, slug, body.model_dump(), user_id_for_order(user))


@router.put("/admin/{slug}", dependencies=[Depends(owner)])
async def save_settings(body: ShopSettings, slug: str = Slug, db: AsyncSession = Depends(get_db)):
    data = body.model_dump(exclude={"enabled"})
    await svc.save_settings(db, slug, body.enabled, data)
    return {"ok": True}


@router.put("/admin/{slug}/products", dependencies=[Depends(owner)])
async def save_products(products: list[Product], slug: str = Slug, db: AsyncSession = Depends(get_db)):
    if len({p.sku for p in products}) != len(products):
        raise HTTPException(422, "Артикулы повторяются")
    return {"saved": await svc.replace_products(db, slug, [p.model_dump() for p in products])}


@router.get("/admin/{slug}/telegram-link", dependencies=[Depends(owner)])
async def telegram_link(slug: str, db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    return await svc.link_url(db, slug)


@router.get("/admin/{slug}/orders", dependencies=[Depends(owner)])
async def orders(slug: str, db: AsyncSession = Depends(get_db)):
    return {"items": await svc.recent_orders(db, slug)}


# ---------------- the partner's cabinet (signed in through the shop's Telegram) ----------------
async def partner(slug: str = Slug, authorization: Optional[str] = Header(default=None, alias="Authorization"),
                  db: AsyncSession = Depends(get_db)) -> str:
    return await cabinet.authorize(db, slug, authorization)


@router.post("/{slug}/cabinet/login")
async def cabinet_login(body: CabinetLogin, slug: str = Slug, db: AsyncSession = Depends(get_db)):
    return await cabinet.login(db, slug, body.code)


@router.get("/{slug}/cabinet")
async def cabinet_overview(slug: str = Slug, _chat: str = Depends(partner), db: AsyncSession = Depends(get_db)):
    return await cabinet.overview(db, slug)


@router.patch("/{slug}/cabinet/products/{sku}")
async def cabinet_product(body: ProductChange, slug: str = Slug, sku: str = Path(max_length=40),
                          _chat: str = Depends(partner), db: AsyncSession = Depends(get_db)):
    return await cabinet.update_product(db, slug, sku, body.model_dump(exclude_none=True))


@router.post("/{slug}/cabinet/orders/{order_id}/status")
async def cabinet_status(body: StatusChange, order_id: int, slug: str = Slug, chat: str = Depends(partner),
                         db: AsyncSession = Depends(get_db)):
    return await cabinet.set_status(db, slug, order_id, body.status, await cabinet.chat_name(db, slug, chat))


@router.post("/{slug}/cabinet/telegram-link")
async def cabinet_invite(slug: str = Slug, _chat: str = Depends(partner), db: AsyncSession = Depends(get_db)):
    """A one-day link for a colleague to receive orders too."""
    return await svc.link_url(db, slug)
