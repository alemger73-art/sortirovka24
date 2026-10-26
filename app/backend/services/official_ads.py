"""«Разместить в Sortirovka Official» — paid placement in the district Telegram channel.

Flow: a person sends the text and photos from the site → the owner gets them in Telegram with buttons
«Бизнес / Недвижимость и услуги / Вакансии и частные» → the support WhatsApp number sends the person
the chosen category, the price and the Kaspi payment link → the owner taps «Оплачено», then «Опубликовано»
(the person gets a WhatsApp message each time, and sees the status in the cabinet).
Prices, descriptions and Kaspi links are edited in the admin. Tables are created on first use (no migration).
"""
from __future__ import annotations

import html
import json
import logging
import os
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import httpx
from sqlalchemy import text

logger = logging.getLogger(__name__)
KZ = timezone(timedelta(hours=5))
SITE = os.getenv("PUBLIC_SITE_URL", "https://www.sortirovka24.kz").rstrip("/")
CALLBACK_RE = re.compile(r"^of:(c|r|p|d):(\d+)(?::([a-z]+))?$")
CATEGORY_CODES = ("business", "services", "private")
STATUSES = ("new", "priced", "paid", "published", "rejected")
MAX_OPEN_PER_USER = 5

DEFAULTS: dict[str, Any] = {
    "enabled": True,
    "channel": "Sortirovka Official",
    "subscribers": "30 000",
    "intro": ("В Sortirovka Official — 30 000 живых подписчиков, жителей Сортировки. Покажем ваше объявление "
              "местной аудитории: потенциальным клиентам, покупателям, арендаторам или сотрудникам."),
    "categories": [
        {"code": "business", "title": "Бизнес", "price": 5000,
         "description": "Реклама компаний, магазинов, кафе, салонов, заведений, а также их товаров, акций и специальных предложений.",
         "kaspi_link": ""},
        {"code": "services", "title": "Недвижимость и услуги", "price": 3000,
         "description": ("Продажа и сдача в аренду квартир, домов, комнат и коммерческих помещений. Услуги частных "
                         "специалистов: ремонт, уборка, перевозки, обучение, красота и другие."),
         "kaspi_link": ""},
        {"code": "private", "title": "Вакансии и частные объявления", "price": 1500,
         "description": "Поиск сотрудников, поиск работы, продажа личных вещей и другие разовые частные объявления.",
         "kaspi_link": ""},
    ],
}
REJECT_TEXT = ("К сожалению, это объявление мы не можем разместить в Sortirovka Official. "
               "Если есть вопросы — просто ответьте на это сообщение.")

_ready: set[int] = set()


def now_iso() -> str:
    return datetime.now(KZ).isoformat(timespec="seconds")


async def ensure_tables(db) -> None:
    key = id(getattr(db, "bind", None))
    if key in _ready:
        return
    try:
        await _create_tables(db)
    except Exception:
        # Two first requests at the same moment: the other one created the tables — just try once more.
        await db.rollback()
        await _create_tables(db)
    _ready.add(key)


async def _create_tables(db) -> None:
    dialect = getattr(getattr(db, "bind", None), "dialect", None)
    pk = "SERIAL PRIMARY KEY" if getattr(dialect, "name", "") == "postgresql" else "INTEGER PRIMARY KEY AUTOINCREMENT"
    await db.execute(text(
        f"CREATE TABLE IF NOT EXISTS official_requests (id {pk}, created_at VARCHAR(32), updated_at VARCHAR(32), "
        "user_id VARCHAR(64), name VARCHAR(80), phone VARCHAR(20), body TEXT, photos TEXT, ann_id INTEGER, "
        "wish VARCHAR(16), category VARCHAR(16), price INTEGER, pay_link TEXT, status VARCHAR(16), note TEXT)"))
    await db.execute(text("CREATE INDEX IF NOT EXISTS official_requests_user ON official_requests (user_id)"))
    await db.execute(text("CREATE TABLE IF NOT EXISTS official_settings (key VARCHAR(40) PRIMARY KEY, value TEXT)"))
    await db.commit()


# ---------------- settings ----------------
def _clean_settings(raw: dict) -> dict:
    out = json.loads(json.dumps(DEFAULTS))
    for k in ("enabled",):
        if k in raw:
            out[k] = bool(raw[k])
    for k in ("channel", "subscribers", "intro"):
        if isinstance(raw.get(k), str) and raw[k].strip():
            out[k] = raw[k].strip()[:600]
    given = {c.get("code"): c for c in raw.get("categories") or [] if isinstance(c, dict)}
    for cat in out["categories"]:
        new = given.get(cat["code"]) or {}
        if isinstance(new.get("title"), str) and new["title"].strip():
            cat["title"] = new["title"].strip()[:60]
        if isinstance(new.get("description"), str) and new["description"].strip():
            cat["description"] = new["description"].strip()[:400]
        try:
            price = int(str(new.get("price", cat["price"])).replace(" ", ""))
            if 0 < price <= 1_000_000:
                cat["price"] = price
        except ValueError:
            pass
        link = str(new.get("kaspi_link") or "").strip()
        cat["kaspi_link"] = link[:300] if link.startswith("https://") else ""
    return out


async def get_settings(db) -> dict:
    await ensure_tables(db)
    value = (await db.execute(text("SELECT value FROM official_settings WHERE key = 'config'"))).scalar()
    try:
        return _clean_settings(json.loads(value) if value else {})
    except (ValueError, TypeError):
        return _clean_settings({})


async def save_settings(db, raw: dict) -> dict:
    cfg = _clean_settings(raw or {})
    await ensure_tables(db)
    await db.execute(text("DELETE FROM official_settings WHERE key = 'config'"))
    await db.execute(text("INSERT INTO official_settings (key, value) VALUES ('config', :v)"),
                     {"v": json.dumps(cfg, ensure_ascii=False)})
    await db.commit()
    return cfg


def public_config(cfg: dict) -> dict:
    return {**{k: cfg[k] for k in ("enabled", "channel", "subscribers", "intro")},
            "categories": [{k: c[k] for k in ("code", "title", "price", "description")} for c in cfg["categories"]]}


def category(cfg: dict, code: str) -> Optional[dict]:
    return next((c for c in cfg["categories"] if c["code"] == code), None)


def money(n: int) -> str:
    return f"{int(n):,}".replace(",", " ") + " тг"


# ---------------- requests ----------------
def _row(r) -> dict:
    d = dict(r._mapping)
    d["photos"] = [p for p in (d.get("photos") or "").split(",") if p]
    return d


async def get_request(db, req_id: int) -> Optional[dict]:
    await ensure_tables(db)
    r = (await db.execute(text("SELECT * FROM official_requests WHERE id = :i"), {"i": req_id})).first()
    return _row(r) if r else None


async def list_for_user(db, user_id: str) -> list[dict]:
    await ensure_tables(db)
    rows = (await db.execute(text("SELECT * FROM official_requests WHERE user_id = :u ORDER BY id DESC LIMIT 50"),
                             {"u": user_id})).all()
    return [_row(r) for r in rows]


async def list_all(db, limit: int = 100) -> list[dict]:
    await ensure_tables(db)
    rows = (await db.execute(text("SELECT * FROM official_requests ORDER BY id DESC LIMIT :n"), {"n": limit})).all()
    return [_row(r) for r in rows]


async def create_request(db, *, user_id: str, name: str, phone: str, body: str, photos: list[str],
                         ann_id: Optional[int], wish: Optional[str]) -> dict:
    await ensure_tables(db)
    open_count = (await db.execute(text(
        "SELECT COUNT(*) FROM official_requests WHERE user_id = :u AND status IN ('new', 'priced')"), {"u": user_id})).scalar() or 0
    if open_count >= MAX_OPEN_PER_USER:
        raise ValueError(f"У вас уже {MAX_OPEN_PER_USER} заявок в работе. Дождитесь ответа по ним.")
    stamp = now_iso()
    res = await db.execute(text(
        "INSERT INTO official_requests (created_at, updated_at, user_id, name, phone, body, photos, ann_id, wish, status) "
        "VALUES (:c, :c, :u, :n, :p, :b, :ph, :a, :w, 'new') RETURNING id"),
        {"c": stamp, "u": user_id, "n": name[:80], "p": phone, "b": body, "ph": ",".join(photos[:10]),
         "a": ann_id, "w": wish if wish in CATEGORY_CODES else None})
    new_id = res.scalar()
    await db.commit()
    return await get_request(db, int(new_id))


async def _update(db, req_id: int, **fields) -> None:
    fields["updated_at"] = now_iso()
    sets = ", ".join(f"{k} = :{k}" for k in fields)
    await db.execute(text(f"UPDATE official_requests SET {sets} WHERE id = :id"), {**fields, "id": req_id})
    await db.commit()


# ---------------- messages ----------------
def priced_message(cat: dict, link: str) -> str:
    return (f"Здравствуйте! Ваше объявление относится к категории «{cat['title']}». "
            f"Стоимость размещения — {money(cat['price'])}. Оплатить можно по ссылке: {link}\n\n"
            "После оплаты ответьте на это сообщение — мы опубликуем объявление в Sortirovka Official.")


PAID_MESSAGE = "Оплата получена, спасибо! Публикуем ваше объявление в Sortirovka Official в ближайшее время."
PUBLISHED_MESSAGE = "Ваше объявление опубликовано в Sortirovka Official. Спасибо, что вы с нами!"


async def _whatsapp(phone: str, body: str) -> bool:
    try:
        from services.customer_payment_notice import _whatsapp as send
        await send(phone, body)
        return True
    except Exception as exc:
        logger.warning("[Official] WhatsApp failed: %s", exc)
        return False


async def _cabinet(db, req: dict, title: str, body: str) -> None:
    if not req.get("user_id"):
        return
    try:
        from services.user_notifications import notify_user_by_id
        await notify_user_by_id(db, user_id=str(req["user_id"]), category="announcements",
                                event_key=f"official:{req['id']}:{req['status']}", title=title, body=body,
                                path="/announcements/official", entity_type="official_request", entity_id=str(req["id"]))
    except Exception as exc:
        logger.info("[Official] cabinet notice skipped: %s", exc)


# ---------------- Telegram ----------------
def card_text(req: dict, cfg: dict) -> str:
    esc = lambda v: html.escape(str(v or ""))  # noqa: E731
    wish = category(cfg, req.get("wish") or "")
    lines = [f"⭐ <b>Заявка в Sortirovka Official №{req['id']}</b>",
             f"👤 {esc(req.get('name') or '—')} · {esc(req.get('phone'))}"]
    if wish:
        lines.append(f"Человек выбрал: {esc(wish['title'])} ({money(wish['price'])})")
    if req.get("ann_id"):
        lines.append(f"На сайте: {SITE}/announcements/{req['ann_id']}")
    lines.append(f"📷 Фото: {len(req['photos'])}" if req["photos"] else "📷 Без фото")
    lines += ["", esc(req.get("body") or ""), "", "<b>Выберите категорию — бот отправит человеку цену и ссылку Kaspi в WhatsApp:</b>"]
    return "\n".join(lines)[:4000]


def keyboard(req_id: int, cfg: dict) -> dict:
    rows = [[{"text": f"{c['title']} — {money(c['price'])}", "callback_data": f"of:c:{req_id}:{c['code']}"}]
            for c in cfg["categories"]]
    rows.append([{"text": "❌ Не подходит", "callback_data": f"of:r:{req_id}"}])
    return {"inline_keyboard": rows}


def after_price_keyboard(req_id: int) -> dict:
    return {"inline_keyboard": [[{"text": "💰 Оплачено", "callback_data": f"of:p:{req_id}"}],
                                [{"text": "❌ Отменить", "callback_data": f"of:r:{req_id}"}]]}


def after_paid_keyboard(req_id: int) -> dict:
    return {"inline_keyboard": [[{"text": "📣 Опубликовано в канале", "callback_data": f"of:d:{req_id}"}]]}


async def send_to_owner(db, req: dict) -> bool:
    from services.news_agent import approval_chat, bot_token, tg
    if not (bot_token() and approval_chat()):
        return False
    cfg = await get_settings(db)
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            photos = [p for p in req["photos"] if p.startswith("https://")]
            if len(photos) == 1:
                await tg(client, "sendPhoto", {"chat_id": approval_chat(), "photo": photos[0]}, timeout=30)
            elif photos:
                await tg(client, "sendMediaGroup", {"chat_id": approval_chat(),
                         "media": [{"type": "photo", "media": p} for p in photos[:10]]}, timeout=30)
            await tg(client, "sendMessage", {"chat_id": approval_chat(), "text": card_text(req, cfg), "parse_mode": "HTML",
                     "disable_web_page_preview": True, "reply_markup": keyboard(req["id"], cfg)})
        return True
    except Exception as exc:
        logger.warning("[Official] owner card failed: %s", exc)
        return False


async def decide(db, req_id: int, action: str, code: str = "") -> tuple[str, Optional[dict], Optional[dict]]:
    """Owner's tap. Returns (short answer, request, next keyboard or None)."""
    req = await get_request(db, req_id)
    if not req:
        return "Заявка не найдена", None, None
    status = req["status"]
    if action == "c":
        cfg = await get_settings(db)
        cat = category(cfg, code)
        if not cat:
            return "Нет такой категории", req, None
        if status not in ("new", "priced"):
            return "Заявка уже обработана", req, None
        link = cat["kaspi_link"]
        if not link:
            return "Сначала добавьте ссылку Kaspi для этой категории: Админка → Объявления → Sortirovka Official", req, None
        sent = await _whatsapp(req["phone"], priced_message(cat, link))
        await _update(db, req_id, status="priced", category=cat["code"], price=cat["price"], pay_link=link)
        req = await get_request(db, req_id)
        await _cabinet(db, req, "Заявка в Sortirovka Official проверена",
                       f"Категория «{cat['title']}», стоимость {money(cat['price'])}. Ссылка на оплату — в WhatsApp и на странице заявки.")
        answer = f"{cat['title']}: {money(cat['price'])}. " + ("Сообщение отправлено в WhatsApp" if sent else "WhatsApp не ушёл — напишите человеку сами")
        return answer, req, after_price_keyboard(req_id)
    if action == "p":
        if status != "priced":
            return "Сначала выберите категорию" if status == "new" else "Уже отмечено", req, None
        await _update(db, req_id, status="paid")
        req = await get_request(db, req_id)
        await _whatsapp(req["phone"], PAID_MESSAGE)
        await _cabinet(db, req, "Оплата получена", PAID_MESSAGE)
        return "Отмечено как оплачено", req, after_paid_keyboard(req_id)
    if action == "d":
        if status != "paid":
            return "Сначала отметьте оплату" if status in ("new", "priced") else "Уже отмечено", req, None
        await _update(db, req_id, status="published")
        req = await get_request(db, req_id)
        await _whatsapp(req["phone"], PUBLISHED_MESSAGE)
        await _cabinet(db, req, "Объявление опубликовано в Sortirovka Official", PUBLISHED_MESSAGE)
        return "Готово: опубликовано", req, None
    if action == "r":
        if status in ("paid", "published"):
            return "Заявка уже оплачена — отменить нельзя", req, None
        if status == "rejected":
            return "Уже отклонено", req, None
        await _update(db, req_id, status="rejected")
        req = await get_request(db, req_id)
        await _whatsapp(req["phone"], REJECT_TEXT)
        await _cabinet(db, req, "Заявка в Sortirovka Official отклонена", REJECT_TEXT)
        return "Отклонено, человеку написали", req, None
    return "Готово", req, None


async def handle_callback(db, client: httpx.AsyncClient, data: str, chat_id: Any, message: dict) -> Optional[str]:
    from services.news_agent import tg
    match = CALLBACK_RE.match(data or "")
    if not match:
        return None
    answer, req, markup = await decide(db, int(match.group(2)), match.group(1), match.group(3) or "")
    if req and markup is None and req["status"] in ("published", "rejected"):
        markup = {"inline_keyboard": [[{"text": f"• {answer}", "callback_data": "of:x"}]]}
    if markup is not None:
        try:
            await tg(client, "editMessageReplyMarkup", {"chat_id": chat_id, "message_id": message.get("message_id"),
                                                        "reply_markup": markup})
        except Exception as exc:
            logger.info("[Official] could not update buttons: %s", exc)
    return answer
