"""seed inspectors staff list from mock_data/inspectors.json

Revision ID: k8l9m0n1o2p3
Revises: j5e6f7g8h9i0
Create Date: 2026-06-17 22:00:00.000000

"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "k8l9m0n1o2p3"
down_revision: Union[str, Sequence[str], None] = "j5e6f7g8h9i0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

MOCK_FILE = Path(__file__).resolve().parents[2] / "mock_data" / "inspectors.json"


def _normalize(raw: dict[str, Any]) -> dict[str, Any]:
    def s(key: str) -> str:
        value = raw.get(key)
        return "" if value is None else str(value)

    return {
        "full_name": s("full_name"),
        "position": s("position"),
        "photo_url": s("photo_url"),
        "precinct_number": s("precinct_number"),
        "district": s("district"),
        "address": s("address"),
        "schedule": s("schedule"),
        "phone": s("phone"),
        "whatsapp": s("whatsapp"),
        "streets": s("streets"),
        "description": s("description"),
        "lat": raw.get("lat"),
        "lng": raw.get("lng"),
        "boundary_coords": s("boundary_coords"),
        "is_leadership": bool(raw.get("is_leadership")) if raw.get("is_leadership") is not None else False,
        "leadership_order": int(raw.get("leadership_order") or 0),
        "created_at": s("created_at"),
    }


def _load_records() -> list[dict[str, Any]]:
    records = json.loads(MOCK_FILE.read_text(encoding="utf-8"))
    if not isinstance(records, list):
        raise ValueError("inspectors.json must be a list")
    return [_normalize(item) for item in records if isinstance(item, dict)]


def upgrade() -> None:
    records = _load_records()
    conn = op.get_bind()
    conn.execute(sa.text("DELETE FROM inspectors"))
    if not records:
        return

    insert_sql = sa.text(
        """
        INSERT INTO inspectors (
            full_name, position, photo_url, precinct_number, district, address, schedule,
            phone, whatsapp, streets, description, lat, lng, boundary_coords,
            is_leadership, leadership_order, created_at
        ) VALUES (
            :full_name, :position, :photo_url, :precinct_number, :district, :address, :schedule,
            :phone, :whatsapp, :streets, :description, :lat, :lng, :boundary_coords,
            :is_leadership, :leadership_order, :created_at
        )
        """
    )
    for record in records:
        conn.execute(insert_sql, record)


def downgrade() -> None:
    pass
