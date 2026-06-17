"""Shared inspectors seed data (mock_data/inspectors.json)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

MOCK_FILE = Path(__file__).resolve().parent.parent / "mock_data" / "inspectors.json"

INSPECTOR_SEED_COLUMNS = (
    "full_name",
    "position",
    "photo_url",
    "precinct_number",
    "district",
    "address",
    "schedule",
    "phone",
    "whatsapp",
    "streets",
    "description",
    "lat",
    "lng",
    "boundary_coords",
    "is_leadership",
    "leadership_order",
    "created_at",
)


def normalize_inspector_record(raw: dict[str, Any]) -> dict[str, Any]:
    """Coerce seed JSON into DB-safe values."""
    record: dict[str, Any] = {}
    for key in INSPECTOR_SEED_COLUMNS:
        value = raw.get(key)
        if key in ("phone", "whatsapp", "description", "position", "photo_url", "precinct_number",
                   "district", "address", "schedule", "streets", "boundary_coords", "created_at"):
            record[key] = "" if value is None else value
        elif key in ("lat", "lng"):
            record[key] = value
        elif key == "is_leadership":
            record[key] = bool(value) if value is not None else False
        elif key == "leadership_order":
            record[key] = int(value) if value is not None else 0
        else:
            record[key] = value
    return record


def load_inspectors_seed_records() -> list[dict[str, Any]]:
    if not MOCK_FILE.exists():
        raise FileNotFoundError(f"Файл не найден: {MOCK_FILE}")
    raw_records = json.loads(MOCK_FILE.read_text(encoding="utf-8"))
    if not isinstance(raw_records, list):
        raise ValueError("inspectors.json должен содержать массив записей")
    return [normalize_inspector_record(item) for item in raw_records if isinstance(item, dict)]
