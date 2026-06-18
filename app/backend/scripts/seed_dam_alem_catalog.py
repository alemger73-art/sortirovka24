"""CLI: import full DAM ALEM menu into the database."""

import asyncio
import logging
import sys
from pathlib import Path

# Allow running from repo root or app/backend
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.database import db_manager
from services.dam_alem_catalog_seed import seed_dam_alem_catalog

logger = logging.getLogger(__name__)


async def main() -> None:
    await db_manager.init_db()
    async with db_manager.async_session_maker() as db:
        stats = await seed_dam_alem_catalog(db, replace=True)
        print("DAM ALEM catalog imported:")
        for k, v in stats.items():
            print(f"  {k}: {v}")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(main())
