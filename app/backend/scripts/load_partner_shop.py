"""CLI: load a partner shop (settings + full price list) from data/partner_shops/<slug>.json
and print a one-day Telegram link for the partner to start receiving orders.

    python scripts/load_partner_shop.py magazin-cvetok            # load and print the link
    python scripts/load_partner_shop.py magazin-cvetok --link     # only a fresh link
"""
import asyncio
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.database import db_manager  # noqa: E402
from routers.partner_shop import Product, ShopSettings  # noqa: E402
from services import partner_shop as svc  # noqa: E402


async def main(slug: str, link_only: bool) -> None:
    await db_manager.init_db()
    async with db_manager.async_session_maker() as db:
        if not link_only:
            data = json.loads((ROOT / "data/partner_shops" / f"{slug}.json").read_text(encoding="utf-8"))
            settings = ShopSettings(enabled=data["enabled"], **data["settings"])  # same checks as the admin API
            products = [Product(**p).model_dump() for p in data["products"]]
            if len({p["sku"] for p in products}) != len(products):
                raise SystemExit("Артикулы повторяются")
            await svc.save_settings(db, slug, settings.enabled, settings.model_dump(exclude={"enabled"}))
            print(f"{slug}: {await svc.replace_products(db, slug, products)} products, enabled={settings.enabled}")
        link = await svc.link_url(db, slug)
        print(f"telegram link: {link['url']} (linked chats: {link['linked']})")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    asyncio.run(main(sys.argv[1], "--link" in sys.argv[2:]))
