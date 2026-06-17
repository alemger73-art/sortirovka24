"""Reload inspectors table from mock_data/inspectors.json."""

from __future__ import annotations

import json
import logging
from pathlib import Path

from core.database import db_manager
from services import mock_data as mock_loader

logger = logging.getLogger(__name__)

MOCK_FILE = Path(__file__).resolve().parent.parent / "mock_data" / "inspectors.json"


async def reload_inspectors_from_mock_file() -> int:
    """Delete all inspectors and insert records from mock_data/inspectors.json."""
    if not db_manager.engine:
        raise RuntimeError("База данных не инициализирована")

    if not MOCK_FILE.exists():
        raise FileNotFoundError(f"Файл не найден: {MOCK_FILE}")

    raw_records = json.loads(MOCK_FILE.read_text(encoding="utf-8"))

    async with db_manager.engine.begin() as conn:
        table = await mock_loader._reflect_table(conn, "inspectors")
        records = mock_loader._prepare_records(raw_records, table)
        await conn.execute(table.delete())
        if records:
            await conn.execute(table.insert(), records)

    logger.info("Inspectors reloaded from mock file: %d records", len(records))
    return len(records)
