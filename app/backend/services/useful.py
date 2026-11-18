"""«Полезно знать»: short cards about changes that touch residents — what changes, what to do, where to call.

A card lives as one JSON document (like partner pages) so the editorial format can grow without schema changes.
Residents vote in the card's poll once (a later vote replaces the earlier one); the discussion is an ordinary
«Вся Сортировка» post written by the editorial account.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import text

from services import neighbors

_ready: set[int] = set()


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


async def ensure_tables(db) -> None:
    key = id(getattr(db, "bind", None))
    if key in _ready:
        return
    try:
        await _create_tables(db)
    except Exception:
        await db.rollback()  # two first requests at once: the other one created the tables
        await _create_tables(db)
    _ready.add(key)


async def _create_tables(db) -> None:
    for stmt in (
        "CREATE TABLE IF NOT EXISTS useful_cards (slug VARCHAR(80) PRIMARY KEY, content TEXT NOT NULL, "
        "published INTEGER DEFAULT 0, discussion_post_id INTEGER, created_at VARCHAR(32), updated_at VARCHAR(32))",
        "CREATE TABLE IF NOT EXISTS useful_votes (slug VARCHAR(80) NOT NULL, user_id VARCHAR(64) NOT NULL, "
        "choice INTEGER NOT NULL, created_at VARCHAR(32))",
        "CREATE UNIQUE INDEX IF NOT EXISTS useful_votes_once ON useful_votes (slug, user_id)",
    ):
        await db.execute(text(stmt))
    await db.commit()


def _card(row) -> dict:
    content = json.loads(row.content or "{}")
    return {**content, "slug": row.slug, "published": bool(row.published), "discussion_post_id": row.discussion_post_id,
            "created_at": row.created_at, "updated_at": row.updated_at}


def teaser(card: dict) -> dict:
    keys = ("slug", "title", "summary", "badge", "category", "image_url", "created_at")
    return {k: card.get(k) for k in keys}


async def listing(db, *, include_drafts: bool = False) -> list[dict]:
    await ensure_tables(db)
    where = "" if include_drafts else "WHERE published = 1"
    rows = (await db.execute(text(f"SELECT * FROM useful_cards {where} ORDER BY created_at DESC LIMIT 50"))).all()
    return [_card(r) for r in rows]


async def get(db, slug: str, *, include_drafts: bool = False) -> Optional[dict]:
    await ensure_tables(db)
    row = (await db.execute(text("SELECT * FROM useful_cards WHERE slug = :s"), {"s": slug})).first()
    if not row or (not row.published and not include_drafts):
        return None
    return _card(row)


async def poll_results(db, card: dict, user_id: Optional[str]) -> dict:
    options = (card.get("poll") or {}).get("options") or []
    rows = (await db.execute(text("SELECT choice, COUNT(*) AS n FROM useful_votes WHERE slug = :s GROUP BY choice"),
                             {"s": card["slug"]})).all()
    counts = [0] * len(options)
    for r in rows:
        if 0 <= r.choice < len(counts):
            counts[r.choice] = int(r.n)
    mine = None
    if user_id:
        mine = (await db.execute(text("SELECT choice FROM useful_votes WHERE slug = :s AND user_id = :u"),
                                 {"s": card["slug"], "u": user_id})).scalar()
    return {"counts": counts, "total": sum(counts), "mine": mine}


async def vote(db, card: dict, user_id: str, choice: int) -> dict:
    options = (card.get("poll") or {}).get("options") or []
    if not 0 <= choice < len(options):
        raise ValueError("Выберите вариант ответа")
    params = {"s": card["slug"], "u": user_id, "c": choice, "t": now_iso()}
    updated = await db.execute(text("UPDATE useful_votes SET choice = :c, created_at = :t WHERE slug = :s AND user_id = :u"), params)
    if not updated.rowcount:
        await db.execute(text("INSERT INTO useful_votes (slug, user_id, choice, created_at) VALUES (:s, :u, :c, :t)"), params)
    await db.commit()
    return await poll_results(db, card, user_id)


async def save(db, slug: str, content: dict, published: bool) -> dict:
    """Create or update a card; the first publication opens its discussion in «Вся Сортировка»."""
    await ensure_tables(db)
    stamp = now_iso()
    existing = (await db.execute(text("SELECT * FROM useful_cards WHERE slug = :s"), {"s": slug})).first()
    body = json.dumps(content, ensure_ascii=False)
    if existing:
        await db.execute(text("UPDATE useful_cards SET content = :c, published = :p, updated_at = :t WHERE slug = :s"),
                         {"c": body, "p": int(published), "t": stamp, "s": slug})
    else:
        await db.execute(text("INSERT INTO useful_cards (slug, content, published, created_at, updated_at) VALUES (:s, :c, :p, :t, :t)"),
                         {"s": slug, "c": body, "p": int(published), "t": stamp})
    await db.commit()
    card = await get(db, slug, include_drafts=True)
    if published and not card["discussion_post_id"]:
        post_id = await neighbors.editorial_post(db, discussion_text(card))
        await db.execute(text("UPDATE useful_cards SET discussion_post_id = :p WHERE slug = :s"), {"p": post_id, "s": slug})
        await db.commit()
        card["discussion_post_id"] = post_id
    return card


def discussion_text(card: dict) -> str:
    question = (card.get("poll") or {}).get("question") or "Что думаете?"
    return f"💡 Полезно знать: {card['title']}\n\n{card.get('summary') or ''}\n\n{question} Подробности: sortirovka24.kz/useful/{card['slug']}".strip()


def public(card: dict, poll: dict) -> dict[str, Any]:
    out = {k: v for k, v in card.items() if k != "published"}
    return {**out, "poll_results": poll}
