"""CLI: add a partner's new items from data/partner_shops/<slug>.json without touching what the partner changed.

    python scripts/add_partner_products.py magazin-cvetok

Unlike load_partner_shop.py (which replaces the whole price list), this only inserts SKUs the shop does not have
yet. Existing items keep the price, availability and description the partner set in their cabinet; only their
position in the list follows the file. Categories missing from the shop settings are appended to them.
"""
import asyncio
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from sqlalchemy import text  # noqa: E402

from core.database import db_manager  # noqa: E402
from routers.partner_shop import Product  # noqa: E402
from services import partner_shop as svc  # noqa: E402
from services.partner_shop_seed import DATA  # noqa: E402


async def add_new(db, slug: str) -> tuple[int, int]:
    data = json.loads((DATA / f"{slug}.json").read_text(encoding="utf-8"))
    products = [Product(**p).model_dump() for p in data["products"]]  # the same checks as the admin API
    await svc.ensure_tables(db)
    raw = (await db.execute(text("SELECT settings FROM partner_shops WHERE slug = :s"), {"s": slug})).scalar()
    if raw is None:
        raise SystemExit(f"{slug}: магазина нет в базе — сначала load_partner_shop.py")
    settings = json.loads(raw or "{}")
    categories = list(settings.get("categories") or [])
    added_categories = [c for c in data["settings"]["categories"] if c not in categories]
    if added_categories:
        settings["categories"] = categories + added_categories
        await db.execute(text("UPDATE partner_shops SET settings = :v WHERE slug = :s"),
                         {"v": json.dumps(settings, ensure_ascii=False), "s": slug})
    existing = set((await db.execute(text("SELECT sku FROM partner_shop_products WHERE shop = :s"), {"s": slug})).scalars())
    added = 0
    for sort, p in enumerate(products):
        if p["sku"] in existing:
            await db.execute(text("UPDATE partner_shop_products SET sort = :sort WHERE shop = :s AND sku = :sku"),
                             {"sort": sort, "s": slug, "sku": p["sku"]})
            continue
        await db.execute(text(
            "INSERT INTO partner_shop_products (shop, sku, category, name, kind, height_cm, pot_cm, price, image, description, "
            "light, water, easy, active, sort) VALUES (:shop, :sku, :category, :name, :kind, :height_cm, :pot_cm, :price, :image, "
            ":description, :light, :water, :easy, TRUE, :sort)"), {**p, "shop": slug, "sort": sort})
        added += 1
    await db.commit()
    return added, len(added_categories)


async def main(slug: str) -> None:
    await db_manager.init_db()
    async with db_manager.async_session_maker() as db:
        added, categories = await add_new(db, slug)
    print(f"{slug}: добавлено товаров {added}, новых категорий {categories}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    asyncio.run(main(sys.argv[1]))
