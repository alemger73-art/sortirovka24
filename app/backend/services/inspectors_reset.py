"""Reload inspectors table from mock_data/inspectors.json."""

from __future__ import annotations

import logging

from core.database import db_manager
from services import mock_data as mock_loader
from services.inspectors_seed import load_inspectors_seed_records

logger = logging.getLogger(__name__)


async def reload_inspectors_from_mock_file() -> int:
    """Delete all inspectors and insert records from mock_data/inspectors.json."""
    if not db_manager.engine:
        await db_manager.init_db()

    if not db_manager.engine:
        raise RuntimeError("База данных не инициализирована")

    records = load_inspectors_seed_records()

    async with db_manager.engine.begin() as conn:
        table = await mock_loader._reflect_table(conn, "inspectors")
        prepared = mock_loader._prepare_records(records, table)
        await conn.execute(table.delete())
        if prepared:
            await conn.execute(table.insert(), prepared)

    logger.info("Inspectors reloaded from mock file: %d records", len(records))
    return len(records)
