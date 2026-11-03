"""Partner shops shipped with the code (data/partner_shops/<slug>.json).

At startup a shop that is not in the database yet is created from its file; an existing shop is left
alone, so changes made later (prices, hidden items) are never overwritten. `load_shop` forces a reload."""
import json
import logging
from pathlib import Path

from sqlalchemy import text

from routers.partner_shop import Product, ShopSettings
from services import partner_shop as svc

logger = logging.getLogger(__name__)
DATA = Path(__file__).resolve().parents[1] / "data" / "partner_shops"


async def load_shop(db, slug: str) -> int:
    data = json.loads((DATA / f"{slug}.json").read_text(encoding="utf-8"))
    settings = ShopSettings(enabled=data["enabled"], **data["settings"])  # the same checks as the admin API
    products = [Product(**p).model_dump() for p in data["products"]]
    if len({p["sku"] for p in products}) != len(products):
        raise ValueError(f"{slug}: артикулы повторяются")
    await svc.save_settings(db, slug, settings.enabled, settings.model_dump(exclude={"enabled"}))
    return await svc.replace_products(db, slug, products)


async def seed_partner_shops(db) -> None:
    await svc.ensure_tables(db)
    existing = set((await db.execute(text("SELECT slug FROM partner_shops"))).scalars())
    for path in sorted(DATA.glob("*.json")):
        if path.stem not in existing:
            logger.info("[PartnerShop] %s: %s products loaded", path.stem, await load_shop(db, path.stem))
