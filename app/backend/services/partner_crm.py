"""Partner-lead CRM on top of existing tables.

A lead is a row in business_partner_requests (its status is the pipeline stage).
Everything else — notes, stage changes, next-contact dates, the agent's findings —
is an event in user_actions (entity='business_partner_requests'), the same store
the lead's creation already uses. No extra tables.
"""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import select

from models.business_partner_requests import Business_partner_requests
from models.user_management import UserAction

ENTITY = "business_partner_requests"
STAGES = {
    "new": "Новая",
    "in_progress": "В работе",
    "negotiation": "Переговоры",
    "done": "Партнёр",
    "rejected": "Отказ",
}
STAGE_PATTERN = "^(" + "|".join(STAGES) + ")$"

CATEGORY_RULES = [
    ("Еда и кафе", r"кафе|ресторан|еда|кухн|пицц|суши|шаурм|кофе|пекарн|кондитер|бар\b|столов|фастфуд"),
    ("Магазин", r"магазин|продукт|маркет|торгов|бутик|одежд|аптек|цвет"),
    ("Такси и доставка", r"такси|доставк|курьер|грузоперевоз|перевоз|логист"),
    ("Красота и здоровье", r"салон|красот|барбер|парикмах|маникюр|косметол|стомат|клиник|массаж|фитнес|спорт"),
    ("Авто", r"авто|\bсто\b|шиномонт|автомойк|запчаст"),
    ("Стройка и ремонт", r"строй|ремонт|сантех|электрик|мебел|окна|двер|отделк|материал"),
    ("Услуги", r"услуг|ремонт|сервис|юрист|бухгалт|клининг|обучен|курс|репетитор"),
]


def category_of(activity: str, description: str = "") -> str:
    text = f"{activity} {description}".lower()
    for name, rule in CATEGORY_RULES:
        if re.search(rule, text):
            return name
    return "Другое"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def record(db, lead_id: int, action: str, payload: dict[str, Any]) -> UserAction:
    row = UserAction(action=action, entity=ENTITY, entity_id=str(lead_id),
                     payload=json.dumps(payload, ensure_ascii=False))
    db.add(row)
    return row


def set_stage(db, lead: Business_partner_requests, stage: str, actor: str, via: str) -> bool:
    """Move a lead to a stage and log it. Returns False when nothing changed."""
    if stage not in STAGES:
        raise ValueError(stage)
    before = lead.status or "new"
    if before == stage:
        return False
    lead.status = stage
    record(db, lead.id, "partner_lead_status", {"from": before, "to": stage, "actor": actor, "via": via})
    return True


async def events(db, lead_ids: list[int]) -> dict[int, list[UserAction]]:
    if not lead_ids:
        return {}
    rows = (await db.scalars(select(UserAction).where(
        UserAction.entity == ENTITY, UserAction.entity_id.in_([str(i) for i in lead_ids])
    ).order_by(UserAction.created_at, UserAction.id))).all()
    out: dict[int, list[UserAction]] = {}
    for row in rows:
        out.setdefault(int(row.entity_id), []).append(row)
    return out


def _payload(row: UserAction) -> dict[str, Any]:
    try:
        value = json.loads(row.payload or "{}")
        return value if isinstance(value, dict) else {}
    except ValueError:
        return {}


def summary(rows: list[UserAction]) -> dict[str, Any]:
    """CRM fields for a lead card: category, duplicate, next contact, last note."""
    info: dict[str, Any] = {"category": None, "duplicate_of": None, "next_contact": None,
                            "last_note": None, "last_activity_at": None}
    for row in rows:
        data = _payload(row)
        if row.action == "partner_lead_agent":
            info["category"] = data.get("category")
            info["duplicate_of"] = data.get("duplicate_of")
        elif row.action == "partner_lead_next_contact":
            info["next_contact"] = data.get("at")
        elif row.action == "partner_lead_note":
            info["last_note"] = data.get("text")
        if row.action != "partner_lead_reminder" and row.created_at:
            info["last_activity_at"] = row.created_at.isoformat()
    return info


TITLES = {
    "partner_lead_created": "Заявка получена с сайта",
    "partner_lead_agent": "Агент проверил заявку",
    "partner_lead_status": "Этап изменён",
    "partner_lead_note": "Заметка",
    "partner_lead_next_contact": "Следующий контакт",
    "partner_lead_reminder": "Напоминание отправлено",
}


def timeline_item(row: UserAction) -> dict[str, Any]:
    data = _payload(row)
    text = None
    if row.action == "partner_lead_status":
        text = f"{STAGES.get(data.get('from'), data.get('from'))} → {STAGES.get(data.get('to'), data.get('to'))}"
    elif row.action == "partner_lead_note":
        text = data.get("text")
    elif row.action == "partner_lead_next_contact":
        text = data.get("at") or "снят"
    elif row.action == "partner_lead_agent":
        parts = [f"Категория: {data.get('category')}"]
        if data.get("duplicate_of"):
            parts.append(f"повторная заявка, раньше была №{data['duplicate_of']}")
        text = "; ".join(parts)
    elif row.action == "partner_lead_reminder":
        text = data.get("reason")
    actor = data.get("actor") or (data.get("actor_role") if isinstance(data.get("actor"), str) else None)
    if isinstance(data.get("actor"), dict):
        actor = data["actor"].get("role")
    return {"id": row.id, "kind": row.action, "title": TITLES.get(row.action, row.action), "text": text,
            "actor": actor, "via": data.get("via"), "at": row.created_at.isoformat() if row.created_at else None}


def parse_next_contact(value: Optional[str]) -> Optional[str]:
    """Accepts YYYY-MM-DD or an ISO datetime; returns an ISO date string or None."""
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).date().isoformat()
    except ValueError:
        raise ValueError("Дата в формате ГГГГ-ММ-ДД")
