"""Paid services the site depends on (hosting, domain, subscriptions) and payment reminders.

The owner keeps the list in the admin panel: name, amount, period, next payment date, payment link.
Every morning the agent looks at the dates and writes to Telegram 7, 3 and 1 days before, on the day,
and every day while a payment is overdue. Each reminder has an «Оплачено» button that moves the date
to the next period. Reminders go to a separate Telegram group: the owner creates a group whose name
contains «оплат» (for example «Оплаты сервисов») and adds the bot — or writes /payments in any group.
Until then they go to the owner's private chat with the bot.
The site's TLS certificate is checked as well, so an expiring one is never a surprise.
"""
from __future__ import annotations

import asyncio
import calendar
import html
import json
import logging
import os
import re
import socket
import ssl
from datetime import date, datetime, timedelta, timezone
from typing import Any, Optional
from zoneinfo import ZoneInfo

import httpx
from sqlalchemy import text

logger = logging.getLogger(__name__)

TZ = ZoneInfo("Asia/Almaty")
STATE_KEY = "paid_services_state"
PERIODS = {"month": "в месяц", "quarter": "в квартал", "year": "в год", "once": "разово"}
CURRENCIES = {"KZT": "₸", "USD": "$", "EUR": "€", "RUB": "₽"}
REMIND_DAYS = (7, 3, 1, 0)
OVERDUE_DAYS = 14          # daily reminders while overdue, then the service is left to the admin panel
CERT_WARN_DAYS = 14
GROUP_TITLE = re.compile(r"оплат|платеж|платёж|payment", re.I)
CALLBACK_RE = re.compile(r"ps:p:(\d+):(\d{4}-\d{2}-\d{2})?")

SEED = [
    ("Hoster.kz — сервер сайта", 9600, "KZT", "month", "https://hoster.kz", "Основной сервер: сайт, база, боты"),
    ("Hoster.kz — резервные копии", 3100, "KZT", "month", "https://hoster.kz", "Ежечасные копии базы"),
    ("Домен sortirovka24.kz", 0, "KZT", "year", "https://hoster.kz", "Укажите сумму и дату продления"),
    ("Claude", 100, "USD", "month", "https://claude.ai/settings/billing", "Подписка для разработки"),
    ("Cloudinary — фото", 0, "USD", "month", "https://console.cloudinary.com", "Бесплатный тариф? Тогда можно выключить"),
    ("ElevenLabs — голос и музыка", 0, "USD", "month", "https://elevenlabs.io/app/subscription", ""),
    ("Railway", 0, "USD", "month", "https://railway.com/account/billing", "Старый хостинг — после отключения удалите"),
]

_ready: set[int] = set()


def today() -> date:
    return datetime.now(TZ).date()


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


# ---------------- storage ----------------
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
    dialect = getattr(getattr(db, "bind", None), "dialect", None)
    pk = "SERIAL PRIMARY KEY" if getattr(dialect, "name", "") == "postgresql" else "INTEGER PRIMARY KEY AUTOINCREMENT"
    for stmt in (
        f"CREATE TABLE IF NOT EXISTS paid_services (id {pk}, name VARCHAR(120) NOT NULL, amount NUMERIC(14,2) DEFAULT 0, "
        "currency VARCHAR(3) DEFAULT 'KZT', period VARCHAR(8) DEFAULT 'month', due_date VARCHAR(10), "
        "pay_url VARCHAR(500), note VARCHAR(500), active INTEGER DEFAULT 1, created_at VARCHAR(32), updated_at VARCHAR(32))",
        f"CREATE TABLE IF NOT EXISTS paid_service_log (id {pk}, service_id INTEGER NOT NULL, due_date VARCHAR(10), "
        "amount NUMERIC(14,2), currency VARCHAR(3), paid_by VARCHAR(120), paid_at VARCHAR(32))",
        "CREATE INDEX IF NOT EXISTS paid_service_log_service ON paid_service_log (service_id, paid_at)",
    ):
        await db.execute(text(stmt))
    await db.commit()
    _, state = await load_state(db)
    if not state.get("seeded"):
        count = await db.scalar(text("SELECT COUNT(*) FROM paid_services"))
        if not count:
            for name, amount, cur, period, url, note in SEED:
                await db.execute(text(
                    "INSERT INTO paid_services (name, amount, currency, period, due_date, pay_url, note, active, created_at, updated_at) "
                    "VALUES (:n, :a, :c, :p, '', :u, :o, 1, :t, :t)"), {"n": name, "a": amount, "c": cur, "p": period,
                                                                          "u": url, "o": note, "t": now_iso()})
        state["seeded"] = True
        await save_state(db, state)
    await db.commit()


async def load_state(db) -> tuple[Any, dict[str, Any]]:
    from sqlalchemy import select
    from models.module_settings import ModuleSettings
    row = await db.scalar(select(ModuleSettings).where(ModuleSettings.key == STATE_KEY))
    try:
        state = json.loads(row.value or "{}") if row else {}
    except ValueError:
        state = {}
    return row, state if isinstance(state, dict) else {}


async def save_state(db, state: dict[str, Any]) -> None:
    from models.module_settings import ModuleSettings
    row, _ = await load_state(db)
    if not row:
        row = ModuleSettings(key=STATE_KEY)
        db.add(row)
    row.value = json.dumps(state, ensure_ascii=False)
    await db.flush()


# ---------------- values ----------------
def parse_date(value: Any) -> Optional[date]:
    try:
        return date.fromisoformat(str(value or "")[:10])
    except ValueError:
        return None


def add_period(day: date, period: str) -> date:
    months = {"month": 1, "quarter": 3, "year": 12}.get(period, 0)
    if not months:
        return day
    index = day.month - 1 + months
    year, month = day.year + index // 12, index % 12 + 1
    return date(year, month, min(day.day, calendar.monthrange(year, month)[1]))


def next_due(due: date, period: str, now: date) -> date:
    """The next date after a payment: one period on, and never stuck in the past."""
    nxt = add_period(due, period)
    while nxt <= now:
        nxt = add_period(nxt, period)
    return nxt


def money(amount: Any, currency: str) -> str:
    try:
        value = float(amount or 0)
    except (TypeError, ValueError):
        value = 0
    if value <= 0:
        return ""
    shown = f"{value:,.0f}" if value == int(value) else f"{value:,.2f}"
    sign = CURRENCIES.get(currency, currency)
    shown = shown.replace(",", " ")
    return f"${shown}" if currency == "USD" else f"{shown} {sign}"


def clean(body: dict[str, Any]) -> dict[str, Any]:
    name = re.sub(r"\s+", " ", str(body.get("name") or "")).strip()[:120]
    if not name:
        raise ValueError("Укажите название сервиса")
    try:
        amount = round(max(0.0, float(str(body.get("amount") or 0).replace(" ", "").replace(",", "."))), 2)
    except ValueError:
        raise ValueError("Сумма — число, например 9600")
    currency = str(body.get("currency") or "KZT").upper()
    if currency not in CURRENCIES:
        currency = "KZT"
    period = str(body.get("period") or "month")
    if period not in PERIODS:
        period = "month"
    due = str(body.get("due_date") or "").strip()
    if due and not parse_date(due):
        raise ValueError("Дата оплаты в формате ГГГГ-ММ-ДД")
    url = str(body.get("pay_url") or "").strip()[:500]
    if url and not url.startswith("https://"):
        raise ValueError("Ссылка на оплату должна начинаться с https://")
    return {"name": name, "amount": amount, "currency": currency, "period": period, "due_date": due[:10],
            "pay_url": url, "note": re.sub(r"\s+", " ", str(body.get("note") or "")).strip()[:500],
            "active": 1 if body.get("active", True) else 0}


def as_dict(row: Any, now: Optional[date] = None) -> dict[str, Any]:
    now = now or today()
    due = parse_date(row.due_date)
    return {"id": row.id, "name": row.name, "amount": float(row.amount or 0), "currency": row.currency or "KZT",
            "period": row.period or "month", "due_date": row.due_date or "", "pay_url": row.pay_url or "",
            "note": row.note or "", "active": bool(row.active), "days_left": (due - now).days if due else None,
            "price": money(row.amount, row.currency or "KZT")}


# ---------------- admin ----------------
async def list_services(db, now: Optional[date] = None) -> dict[str, Any]:
    await ensure_tables(db)
    rows = (await db.execute(text("SELECT * FROM paid_services ORDER BY active DESC, "
                                  "CASE WHEN due_date IS NULL OR due_date = '' THEN 1 ELSE 0 END, due_date, id"))).all()
    _, state = await load_state(db)
    log = (await db.execute(text("SELECT l.*, s.name FROM paid_service_log l JOIN paid_services s ON s.id = l.service_id "
                                 "ORDER BY l.id DESC LIMIT 20"))).all()
    await db.commit()
    now = now or today()
    items = [as_dict(r, now) for r in rows]
    monthly: dict[str, float] = {}
    for it in items:
        if it["active"] and it["amount"] > 0 and it["period"] != "once":
            per = {"month": 1, "quarter": 3, "year": 12}[it["period"]]
            monthly[it["currency"]] = monthly.get(it["currency"], 0) + it["amount"] / per
    from services.news_agent import approval_chat, bot_token
    return {"items": items, "today": now.isoformat(), "chat": state.get("chat"), "bot": bool(bot_token() and approval_chat()),
            "monthly": [money(v, c) for c, v in monthly.items()], "cert": state.get("cert"),
            "log": [{"name": r.name, "due_date": r.due_date, "price": money(r.amount, r.currency or "KZT"),
                     "paid_by": r.paid_by or "", "paid_at": r.paid_at} for r in log]}


async def save_service(db, body: dict[str, Any], service_id: Optional[int] = None) -> dict[str, Any]:
    await ensure_tables(db)
    data = clean(body)
    params = {**data, "t": now_iso()}
    if service_id:
        res = await db.execute(text(
            "UPDATE paid_services SET name=:name, amount=:amount, currency=:currency, period=:period, due_date=:due_date, "
            "pay_url=:pay_url, note=:note, active=:active, updated_at=:t WHERE id=:id"), {**params, "id": service_id})
        if not res.rowcount:
            raise LookupError("Сервис не найден")
    else:
        await db.execute(text(
            "INSERT INTO paid_services (name, amount, currency, period, due_date, pay_url, note, active, created_at, updated_at) "
            "VALUES (:name, :amount, :currency, :period, :due_date, :pay_url, :note, :active, :t, :t)"), params)
    await db.commit()
    return await list_services(db)


async def delete_service(db, service_id: int) -> None:
    await ensure_tables(db)
    await db.execute(text("DELETE FROM paid_services WHERE id = :id"), {"id": service_id})
    await db.execute(text("DELETE FROM paid_service_log WHERE service_id = :id"), {"id": service_id})
    await db.commit()


async def mark_paid(db, service_id: int, due_seen: Optional[str], by: str) -> tuple[str, Optional[dict[str, Any]]]:
    """«Оплачено»: log it and move the date one period on. `due_seen` guards against a second press on an old message."""
    await ensure_tables(db)
    row = (await db.execute(text("SELECT * FROM paid_services WHERE id = :id"), {"id": service_id})).first()
    if not row:
        return "Сервис уже удалён", None
    due = parse_date(row.due_date)
    if due_seen is not None and (row.due_date or "") != due_seen:
        return "Уже отмечено", as_dict(row)
    now = today()
    await db.execute(text("INSERT INTO paid_service_log (service_id, due_date, amount, currency, paid_by, paid_at) "
                          "VALUES (:s, :d, :a, :c, :b, :t)"),
                     {"s": row.id, "d": row.due_date or "", "a": row.amount or 0, "c": row.currency, "b": by[:120], "t": now_iso()})
    if row.period == "once":
        await db.execute(text("UPDATE paid_services SET active = 0, updated_at = :t WHERE id = :id"), {"t": now_iso(), "id": row.id})
        answer = f"{row.name}: оплачено, больше не напомню"
    else:
        nxt = next_due(due or now, row.period, now)
        await db.execute(text("UPDATE paid_services SET due_date = :d, updated_at = :t WHERE id = :id"),
                         {"d": nxt.isoformat(), "t": now_iso(), "id": row.id})
        answer = f"{row.name}: оплачено. Следующая оплата {ru_date(nxt)}"
    await db.commit()
    fresh = (await db.execute(text("SELECT * FROM paid_services WHERE id = :id"), {"id": service_id})).first()
    return answer, as_dict(fresh)


# ---------------- reminders ----------------
MONTHS = ("января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря")


def ru_date(day: date) -> str:
    return f"{day.day} {MONTHS[day.month - 1]}"


def plural(n: int, one: str, few: str, many: str) -> str:
    n = abs(n)
    if n % 10 == 1 and n % 100 != 11:
        return one
    return few if 2 <= n % 10 <= 4 and not 12 <= n % 100 <= 14 else many


def when_text(days: int) -> str:
    if days < 0:
        return f"🔴 Просрочено на {-days} {plural(days, 'день', 'дня', 'дней')}"
    if days == 0:
        return "🟠 Оплатить сегодня"
    if days == 1:
        return "🟡 Оплатить завтра"
    return f"🟢 Через {days} {plural(days, 'день', 'дня', 'дней')}"


def due_now(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [it for it in items if it["active"] and it["days_left"] is not None
            and (it["days_left"] in REMIND_DAYS or -OVERDUE_DAYS <= it["days_left"] < 0)]


def reminder(it: dict[str, Any]) -> tuple[str, dict[str, Any]]:
    due = parse_date(it["due_date"])
    lines = [f"<b>{html.escape(it['name'])}</b>", when_text(it["days_left"]) + (f" — {ru_date(due)}" if due else "")]
    if it["price"]:
        lines.append(f"Сумма: {it['price']} {PERIODS.get(it['period'], '')}".rstrip())
    if it["note"]:
        lines.append(html.escape(it["note"]))
    buttons = [{"text": "✅ Оплачено", "callback_data": f"ps:p:{it['id']}:{it['due_date']}"}]
    if it["pay_url"]:
        buttons.insert(0, {"text": "Оплатить", "url": it["pay_url"]})
    return "\n".join(lines), {"inline_keyboard": [buttons]}


def overview_text(data: dict[str, Any]) -> str:
    active = [it for it in data["items"] if it["active"]]
    if not active:
        return "Платных сервисов в списке нет. Добавьте их в админке: Система → Платные сервисы."
    lines = ["<b>Платные сервисы</b>"]
    for it in active:
        due = parse_date(it["due_date"])
        when = f"{ru_date(due)} · {when_text(it['days_left'])[2:].lower()}" if due else "дата не указана"
        price = f" — {it['price']}" if it["price"] else ""
        lines.append(f"• {html.escape(it['name'])}{price}: {when}")
    if data["monthly"]:
        lines.append(f"\nВ месяц примерно: {' + '.join(data['monthly'])}")
    missing = sum(1 for it in active if not it["due_date"])
    if missing:
        lines.append(f"\nУ {missing} {plural(missing, 'сервиса', 'сервисов', 'сервисов')} не указана дата оплаты — "
                     "без неё я не смогу напомнить. Админка → Система → Платные сервисы.")
    return "\n".join(lines)


async def target(db) -> Optional[str]:
    from services.news_agent import approval_chat, bot_token
    if not bot_token():
        return None
    _, state = await load_state(db)
    return str((state.get("chat") or {}).get("id") or approval_chat() or "") or None


async def send(client: httpx.AsyncClient, chat_id: str, text_: str, markup: Optional[dict] = None) -> None:
    from services.news_agent import tg
    payload: dict[str, Any] = {"chat_id": chat_id, "text": text_[:4000], "parse_mode": "HTML", "disable_web_page_preview": True}
    if markup:
        payload["reply_markup"] = markup
    await tg(client, "sendMessage", payload)


async def cert_days(host: str) -> Optional[int]:
    def probe() -> Optional[int]:
        ctx = ssl.create_default_context()
        with socket.create_connection((host, 443), timeout=10) as sock:
            with ctx.wrap_socket(sock, server_hostname=host) as tls:
                not_after = tls.getpeercert().get("notAfter")
        if not not_after:
            return None
        expires = datetime.fromtimestamp(ssl.cert_time_to_seconds(not_after), timezone.utc)
        return (expires - datetime.now(timezone.utc)).days
    try:
        return await asyncio.to_thread(probe)
    except Exception as exc:
        logger.info("[Payments] certificate check failed: %s", exc)
        return None


async def daily_check(db, client: httpx.AsyncClient, now: Optional[date] = None) -> int:
    """Send today's reminders. Returns how many messages went out."""
    now = now or today()
    data = await list_services(db, now)
    chat_id = await target(db)
    if not chat_id:
        return 0
    sent = 0
    items = data["items"]
    for it in due_now(items):
        body, markup = reminder(it)
        try:
            await send(client, chat_id, body, markup)
            sent += 1
        except Exception as exc:
            logger.warning("[Payments] reminder for %s failed: %s", it["name"], exc)
    host = os.getenv("PAID_SERVICES_CERT_HOST", "www.sortirovka24.kz").strip()
    days = await cert_days(host) if host else None
    if days is not None:
        _, state = await load_state(db)
        state["cert"] = {"host": host, "days": days, "checked": now.isoformat()}
        await save_state(db, state)
        await db.commit()
        if days <= CERT_WARN_DAYS:
            await send(client, chat_id, f"🔐 <b>Сертификат сайта</b> {html.escape(host)} истекает через {days} "
                       f"{plural(days, 'день', 'дня', 'дней')}. Проверьте Cloudflare → SSL/TLS.")
            sent += 1
    if now.weekday() == 0 and any(it["active"] and not it["due_date"] for it in items):
        await send(client, chat_id, overview_text(data))
        sent += 1
    return sent


async def run_forever(session_maker) -> None:
    """Once a day after PAID_SERVICES_HOUR (Almaty, default 10:00)."""
    if os.getenv("PAID_SERVICES_ENABLED", "1").strip().lower() in {"0", "false", "no", "off"}:
        return
    await asyncio.sleep(30)
    while True:
        try:
            local = datetime.now(TZ)
            if local.hour >= int(os.getenv("PAID_SERVICES_HOUR", "10")):
                async with session_maker() as db:
                    await ensure_tables(db)
                    _, state = await load_state(db)
                    if state.get("day") != local.date().isoformat():
                        state["day"] = local.date().isoformat()  # marked first: a Telegram error must not repeat the batch
                        await save_state(db, state)
                        await db.commit()
                        async with httpx.AsyncClient(timeout=20) as client:
                            await daily_check(db, client)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.warning("[Payments] daily check: %s", exc)
        await asyncio.sleep(600)


# ---------------- Telegram ----------------
def _trusted(sender: str) -> bool:
    from services.news_agent import admin_ids, approval_chat
    return bool(sender) and sender in (admin_ids() | {approval_chat()})


async def _bind(db, client: httpx.AsyncClient, chat: dict[str, Any]) -> None:
    _, state = await load_state(db)
    state["chat"] = {"id": chat.get("id"), "title": chat.get("title") or "группа"}
    await save_state(db, state)
    await db.commit()
    await send(client, str(chat.get("id")), "Готово: напоминания об оплате сервисов будут приходить сюда — "
               "за 7, 3 и 1 день, в день оплаты и каждый день, если просрочено. Кнопка «✅ Оплачено» переносит дату "
               "на следующий период.\n\nСписок — команда /payments.")
    await send(client, str(chat.get("id")), overview_text(await list_services(db)))


async def handle_member(db, client: httpx.AsyncClient, member: dict[str, Any]) -> bool:
    """The bot was added to / removed from a group. True if it is (or was) the payments group."""
    chat = member.get("chat") or {}
    if chat.get("type") not in ("group", "supergroup"):
        return False
    await ensure_tables(db)
    _, state = await load_state(db)
    is_current = str((state.get("chat") or {}).get("id", "")) == str(chat.get("id"))
    status = (member.get("new_chat_member") or {}).get("status")
    actor = str((member.get("from") or {}).get("id", ""))
    if status in ("left", "kicked"):
        if is_current:
            state.pop("chat", None)
            await save_state(db, state)
            await db.commit()
            return True
        return False
    if is_current:
        return True
    if not (_trusted(actor) and GROUP_TITLE.search(chat.get("title") or "")):
        return False
    await _bind(db, client, chat)
    return True


async def handle_message(db, client: httpx.AsyncClient, message: dict[str, Any]) -> bool:
    """/payments command and a group upgraded to a supergroup. True when handled."""
    chat = message.get("chat") or {}
    sender = str((message.get("from") or {}).get("id", ""))
    if message.get("migrate_to_chat_id"):
        await ensure_tables(db)
        _, state = await load_state(db)
        if str((state.get("chat") or {}).get("id", "")) == str(chat.get("id")):
            state["chat"]["id"] = message["migrate_to_chat_id"]
            await save_state(db, state)
            await db.commit()
        return False
    command = str(message.get("text") or "").strip().split()[0:1]
    if not command or command[0].split("@")[0].lower() != "/payments":
        return False
    await ensure_tables(db)
    _, state = await load_state(db)
    is_current = str((state.get("chat") or {}).get("id", "")) == str(chat.get("id"))
    if chat.get("type") in ("group", "supergroup") and not is_current:
        if not _trusted(sender):
            return True
        await _bind(db, client, chat)
        return True
    if is_current or _trusted(sender):
        await send(client, str(chat.get("id")), overview_text(await list_services(db)))
    return True


async def handle_callback(db, client: httpx.AsyncClient, data: str, chat_id: str, sender: dict[str, Any],
                          message: dict[str, Any]) -> Optional[str]:
    match = CALLBACK_RE.fullmatch(data or "")
    if not match:
        return None
    await ensure_tables(db)
    _, state = await load_state(db)
    in_group = str((state.get("chat") or {}).get("id", "")) == chat_id
    if not (in_group or _trusted(str(sender.get("id", "")))):
        return "Нет доступа"
    who = " ".join(x for x in (sender.get("first_name"), sender.get("last_name")) if x) or sender.get("username") or ""
    answer, _ = await mark_paid(db, int(match.group(1)), match.group(2) or "", who)
    from services.news_agent import tg
    try:
        await tg(client, "editMessageReplyMarkup", {"chat_id": chat_id, "message_id": message.get("message_id"),
                                                    "reply_markup": {"inline_keyboard": [[{"text": f"✅ {answer}"[:60], "callback_data": "ps:x"}]]}})
    except Exception as exc:
        logger.info("[Payments] could not update buttons: %s", exc)
    return answer
