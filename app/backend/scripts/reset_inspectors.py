import asyncio
import logging

from core.database import db_manager
from services.inspectors_reset import reload_inspectors_from_mock_file

logger = logging.getLogger(__name__)


async def reset_inspectors() -> None:
    await db_manager.init_db()
    count = await reload_inspectors_from_mock_file()
    logger.info("Reset inspectors: inserted %d records", count)


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    asyncio.run(reset_inspectors())


if __name__ == "__main__":
    main()
