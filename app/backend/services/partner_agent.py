"""Partner-lead agent: watches partnership applications from the site, records
its findings in the CRM, sends each new lead to the owner's Telegram with stage
buttons, and reminds about leads nobody reacted to or a planned follow-up.

Runs inside the news bot loop (same bot, same owner chat)."""

from __future__ import annotations

import html
import json
import os
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import httpx
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from models.business_partner_requests import Business_partner_requests
from models.module_settings import ModuleSettings
from models.user_management import UserAction
from services import partner_crm
from services.news_agent import SITE, TZ, approval_chat, tg

STATE_KEY = "partner_agent_state"
BUTTON_STAGES = {"w": "in_progress", "n": "negotiation", "d": "done", "r": "rejected"}


def enabled() -> bool:
    return (os.getenv("PARTNER_AGENT_ENABLED", "1").strip().lower() not in {"0", "false", "no", "off"})


async def _state(db: AsyncSession) -> tuple[ModuleSettings, dict[str, Any]]:
    row = await db.scalar(select(ModuleSettings).where(ModuleSettings.key == STATE_KEY).with_for_update())
    if not row:
        row = ModuleSettings(key=STATE_KEY, value="{}")
        db.add(row)
        await db.flush()
    try:
        state = json.loads(row.value or "{}")
    except ValueError:
        state = {}
    return row, state if isinstance(state, dict) else {}


def _digits(phone: Optional[str]) -> str:
    return re.sub(r"\D", "", phone or "")


def keyboard(lead: Business_partner_requests) -> dict[str, Any]:
    current = lead.status or "new"

    def btn(code: str, label: str) -> dict[str, str]:
        mark = "• " if BUTTON_STAGES[code] == current else ""
        return {"text": mark + label, "callback_data": f"pl:{code}:{lead.id}"}

    rows = [[btn("w", "📞 Взял в работу"), btn("n", "🤝 Переговоры")],
            [btn("d", "✅ Стал партнёром"), btn("r", "❌ Отказ")],
            [{"text": "📋 Открыть в CRM", "url": f"{SITE}/admin?tab=partners-business"}]]
    wa = _digits(lead.whatsapp or lead.phone)
    if wa:
        rows[2].append({"text": "💬 WhatsApp", "url": f"https://wa.me/{wa}"})
    return {"inline_keyboard": rows}


def lead_text(lead: Business_partner_requests, category: str, duplicate: Optional[Business_partner_requests],
              header: str = "🤝 <b>Новая заявка на партнёрство</b>") -> str:
    e = html.escape
    lines = [f"{header} №{lead.id}", "", f"<b>{e(lead.name or '')}</b> — {e(lead.activity or '')}",
             f"Категория: {e(category)}", f"Телефон: {e(lead.phone or '')}"]
    if lead.whatsapp and lead.whatsapp != lead.phone:
        lines.append(f"WhatsApp: {e(lead.whatsapp)}")
    if lead.description:
        lines += ["", e(lead.description[:700])]
    if duplicate:
        lines += ["", f"⚠️ Повторная заявка: уже была №{duplicate.id} "
                      f"({partner_crm.STAGES.get(duplicate.status or 'new', duplicate.status)})"]
    lines += ["", f"Этап: {partner_crm.STAGES.get(lead.status or 'new')}"]
    return "\n".join(lines)


async def _find_duplicate(db: AsyncSession, lead: Business_partner_requests) -> Optional[Business_partner_requests]:
    phones = {p for p in (lead.phone, lead.whatsapp) if p}
    if not phones:
        return None
    return await db.scalar(select(Business_partner_requests).where(
        Business_partner_requests.id < lead.id,
        or_(Business_partner_requests.phone.in_(phones), Business_partner_requests.whatsapp.in_(phones)),
    ).order_by(Business_partner_requests.id.desc()))


async def process_new(db: AsyncSession, client: httpx.AsyncClient) -> int:
    """Check and announce leads that arrived since the last pass. Returns how many."""
    row, state = await _state(db)
    if "last_id" not in state:
        # First start: existing leads are history; only announce new ones.
        state["last_id"] = int(await db.scalar(select(Business_partner_requests.id).order_by(
            Business_partner_requests.id.desc()).limit(1)) or 0)
        row.value = json.dumps(state)
        await db.commit()
        return 0
    leads = (await db.scalars(select(Business_partner_requests).where(
        Business_partner_requests.id > int(state["last_id"])).order_by(Business_partner_requests.id).limit(10))).all()
    for lead in leads:
        duplicate = await _find_duplicate(db, lead)
        category = partner_crm.category_of(lead.activity or "", lead.description or "")
        partner_crm.record(db, lead.id, "partner_lead_agent", {
            "category": category, "duplicate_of": duplicate.id if duplicate else None, "actor": "agent", "via": "agent"})
        state["last_id"] = lead.id
        row.value = json.dumps(state)
        await db.commit()  # the CRM record stands even if Telegram is down
        try:
            await tg(client, "sendMessage", {"chat_id": approval_chat(), "text": lead_text(lead, category, duplicate),
                     "parse_mode": "HTML", "disable_web_page_preview": True, "reply_markup": keyboard(lead)})
        except Exception:
            pass
    return len(leads)


async def _reminded(db: AsyncSession, lead_id: int, reason: str, since: datetime) -> bool:
    rows = (await db.scalars(select(UserAction).where(
        UserAction.entity == partner_crm.ENTITY, UserAction.entity_id == str(lead_id),
        UserAction.action == "partner_lead_reminder", UserAction.created_at >= since))).all()
    return any(reason in (r.payload or "") for r in rows)


async def remind(db: AsyncSession, client: httpx.AsyncClient, now: Optional[datetime] = None) -> int:
    """Nudge the owner about stale new leads and follow-ups that are due."""
    now = now or datetime.now(timezone.utc)
    local = now.astimezone(TZ)
    if not 9 <= local.hour < 20:
        return 0
    open_leads = (await db.scalars(select(Business_partner_requests).where(
        or_(Business_partner_requests.status.is_(None),
            Business_partner_requests.status.in_(("new", "in_progress", "negotiation")))
    ).order_by(Business_partner_requests.id))).all()
    history = await partner_crm.events(db, [l.id for l in open_leads])
    sent = 0
    for lead in open_leads:
        if sent >= 5:
            break
        info = partner_crm.summary(history.get(lead.id, []))
        reason = None
        if info["next_contact"] and info["next_contact"] <= local.date().isoformat():
            reason = f"Сегодня запланирован контакт ({info['next_contact']})"
            key, since = f"contact:{info['next_contact']}", now - timedelta(days=400)
        else:
            try:
                created = datetime.fromisoformat((lead.created_at or "").replace("Z", "+00:00"))
            except ValueError:
                continue
            if (lead.status or "new") == "new" and now - created > timedelta(hours=24):
                reason = "Заявка ждёт ответа больше суток"
                key, since = "stale", now - timedelta(hours=24)
        if not reason or await _reminded(db, lead.id, key, since):
            continue
        partner_crm.record(db, lead.id, "partner_lead_reminder", {"reason": reason, "key": key, "via": "agent"})
        await db.commit()
        try:
            await tg(client, "sendMessage", {"chat_id": approval_chat(), "parse_mode": "HTML",
                     "disable_web_page_preview": True, "reply_markup": keyboard(lead),
                     "text": lead_text(lead, info["category"] or partner_crm.category_of(lead.activity or ""), None,
                                       header=f"⏰ <b>{html.escape(reason)}</b>\nЗаявка")})
            sent += 1
        except Exception:
            pass
    return sent


async def handle_callback(db: AsyncSession, client: httpx.AsyncClient, code: str, lead_id: int,
                          chat_id: str, message_id: Any) -> str:
    lead = await db.scalar(select(Business_partner_requests).where(
        Business_partner_requests.id == lead_id).with_for_update())
    if not lead:
        return "Заявка не найдена"
    stage = BUTTON_STAGES[code]
    changed = partner_crm.set_stage(db, lead, stage, "owner", "telegram")
    await db.commit()
    try:
        await tg(client, "editMessageReplyMarkup", {"chat_id": chat_id, "message_id": message_id,
                 "reply_markup": keyboard(lead)})
    except Exception:
        pass
    label = partner_crm.STAGES[stage]
    return f"Этап: {label}" if changed else f"Уже: {label}"


async def tick(db: AsyncSession, client: httpx.AsyncClient) -> None:
    if not enabled() or not approval_chat():
        return
    await process_new(db, client)
    await remind(db, client)
