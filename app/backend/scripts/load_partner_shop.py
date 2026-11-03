"""CLI: reload a partner shop (settings + full price list) from data/partner_shops/<slug>.json
and print a one-day Telegram link for the partner to start receiving orders.

    python scripts/load_partner_shop.py magazin-cvetok            # reload and print the link
    python scripts/load_partner_shop.py magazin-cvetok --link     # only a fresh link
"""
import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.database import db_manager  # noqa: E402
from services import partner_shop as svc  # noqa: E402
from services.partner_shop_seed import load_shop  # noqa: E402


async def main(slug: str, link_only: bool) -> None:
    await db_manager.init_db()
    async with db_manager.async_session_maker() as db:
        if not link_only:
            print(f"{slug}: {await load_shop(db, slug)} products loaded")
        link = await svc.link_url(db, slug)
        print(f"telegram link: {link['url']} (linked chats: {link['linked']})")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    asyncio.run(main(sys.argv[1], "--link" in sys.argv[2:]))
