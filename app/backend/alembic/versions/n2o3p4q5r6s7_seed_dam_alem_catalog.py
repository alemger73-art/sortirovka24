"""Alembic: seed full DAM ALEM menu on deploy.

Revision ID: n2o3p4q5r6s7
Revises: m0n1o2p3q4r5
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Sequence, Union

import sqlalchemy as sa
from alembic import op

from services.dam_alem_catalog_data import CATEGORIES, build_items, build_modifier_groups

revision: str = "n2o3p4q5r6s7"
down_revision: Union[str, Sequence[str], None] = "m0n1o2p3q4r5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

logger = logging.getLogger(__name__)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _find_restaurant_id(conn) -> int | None:
    rows = conn.execute(sa.text("SELECT id, name FROM food_restaurants")).fetchall()
    for rid, name in rows:
        n = (name or "").lower().replace(" ", "")
        if "damalem" in n or "dam alem" in (name or "").lower() or "дам алем" in (name or "").lower():
            return int(rid)
    return int(rows[0][0]) if rows else None


def upgrade() -> None:
    conn = op.get_bind()
    rid = _find_restaurant_id(conn)
    if not rid:
        logger.warning("No restaurant for DAM ALEM catalog seed")
        return

    conn.execute(sa.text("DELETE FROM item_modifier_groups"))
    conn.execute(sa.text("DELETE FROM modifier_options"))
    conn.execute(sa.text("DELETE FROM modifier_groups"))
    conn.execute(sa.text("DELETE FROM food_items WHERE restaurant_id = :rid"), {"rid": rid})
    conn.execute(sa.text("DELETE FROM food_categories WHERE restaurant_id = :rid"), {"rid": rid})

    cat_slug_to_id: Dict[str, int] = {}
    for slug, name, sort_order, icon, cat_type, is_active in CATEGORIES:
        res = conn.execute(
            sa.text(
                """
                INSERT INTO food_categories
                (restaurant_id, name, slug, icon, category_type, sort_order, is_active, created_at)
                VALUES (:rid, :name, :slug, :icon, :ctype, :sort_order, :is_active, :created_at)
                RETURNING id
                """
            ),
            {
                "rid": rid,
                "name": name,
                "slug": slug,
                "icon": icon,
                "ctype": cat_type,
                "sort_order": sort_order,
                "is_active": is_active,
                "created_at": _now(),
            },
        )
        cat_slug_to_id[slug] = int(res.scalar_one())

    group_key_to_id: Dict[str, int] = {}
    for g in build_modifier_groups():
        res = conn.execute(
            sa.text(
                """
                INSERT INTO modifier_groups
                (name, type, is_required, min_select, max_select, sort_order, is_active, created_at)
                VALUES (:name, :type, :req, :min_s, :max_s, :sort_order, true, :created_at)
                RETURNING id
                """
            ),
            {
                "name": g["name"],
                "type": "single" if g["type"] == "single" else "multiple",
                "req": bool(g.get("is_required")),
                "min_s": int(g.get("min_select") or 0),
                "max_s": int(g.get("max_select") or 0),
                "sort_order": int(g.get("sort_order") or 0),
                "created_at": _now(),
            },
        )
        gid = int(res.scalar_one())
        group_key_to_id[g["key"]] = gid
        for idx, opt in enumerate(g.get("options") or []):
            conn.execute(
                sa.text(
                    """
                    INSERT INTO modifier_options
                    (group_id, name, price, sort_order, is_active, created_at)
                    VALUES (:gid, :name, :price, :sort_order, true, :created_at)
                    """
                ),
                {
                    "gid": gid,
                    "name": opt["name"],
                    "price": float(opt.get("price") or 0),
                    "sort_order": idx,
                    "created_at": _now(),
                },
            )

    for it in build_items():
        cid = cat_slug_to_id.get(it["category_slug"])
        if not cid:
            continue
        res = conn.execute(
            sa.text(
                """
                INSERT INTO food_items
                (restaurant_id, category_id, name, description, price, image_url,
                 is_active, available, is_recommended, is_popular, is_combo, weight, sort_order, created_at)
                VALUES
                (:rid, :cid, :name, :desc, :price, '', true, true,
                 :pop, :pop, :combo, :weight, :sort_order, :created_at)
                RETURNING id
                """
            ),
            {
                "rid": rid,
                "cid": cid,
                "name": it["name"],
                "desc": it.get("description") or "",
                "price": float(it["price"]),
                "pop": bool(it.get("is_popular")),
                "combo": bool(it.get("is_combo")),
                "weight": it.get("weight") or "",
                "sort_order": int(it.get("sort_order") or 0),
                "created_at": _now(),
            },
        )
        item_id = int(res.scalar_one())
        for sort_idx, gkey in enumerate(it.get("mod_groups") or []):
            mgid = group_key_to_id.get(gkey)
            if not mgid:
                continue
            conn.execute(
                sa.text(
                    """
                    INSERT INTO item_modifier_groups
                    (food_item_id, modifier_group_id, sort_order, created_at)
                    VALUES (:fid, :gid, :sort_order, :created_at)
                    """
                ),
                {"fid": item_id, "gid": mgid, "sort_order": sort_idx, "created_at": _now()},
            )

    logger.info("DAM ALEM catalog seeded via migration for restaurant_id=%s", rid)


def downgrade() -> None:
    pass
