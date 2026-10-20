"""WhatsApp sales bot for DAM ALEM (its own number, its own WAHA server «waha-dam»).

The AI talks to the customer, shows the real menu and prices from our database,
collects the order and asks our pricing engine for an exact quote
(services/business_channel: real catalog, delivery zones, promo codes, kitchen hours).

Safety rules (enforced here, not by the AI):
  * the AI can only *calculate* an order;
  * the order is created only after the customer's own reply «да / иә / подтверждаю»
    to the last calculation (confirm_customer_reply + create_order);
  * if a person from DAM ALEM writes in the chat from the phone, the bot stays silent there;
  * «оператор / живой человек» → the owner gets the chat in Telegram.

Chats are kept in memory (short history); orders, customers and confirmations live in the DB.
"""

from __future__ import annotations

import html
import json
import logging
import os
import re
import time
from dataclasses import dataclass, field
from typing import Any, Optional

import httpx

logger = logging.getLogger(__name__)

SITE = "https://www.sortirovka24.kz"
PROVIDER = "waha-dam"
HISTORY_TURNS = 16
HISTORY_TTL = 12 * 3600
MUTE_AFTER_STAFF = 6 * 3600
MAX_PER_HOUR = 40
MAX_TOOL_ROUNDS = 6
MAX_REPLY_CHARS = 1500
YES_RE = re.compile(r"^\s*(да|ага|угу|давай(те)?|подтверждаю|подтвердить|всё верно|все верно|верно|ок|окей|ok|okay|yes|иә|ия|иа|йа|жарайды|дұрыс|оформляй(те)?|заказываю|го)\b[\s!.)👍]*$", re.I)
NO_RE = re.compile(r"^\s*(нет|не надо|отмена|отменить|стоп|жоқ|жок|no)\b", re.I)
HUMAN_RE = re.compile(r"(оператор|живой|человек|менеджер|администратор|позвоните|жалоба)", re.I)


@dataclass
class Chat:
    turns: list[dict[str, Any]] = field(default_factory=list)
    updated: float = 0.0
    muted_until: float = 0.0
    recent: list[float] = field(default_factory=list)
    name: str = ""
    phone: str = ""
    sent: list[str] = field(default_factory=list)
    sent_ids: list[str] = field(default_factory=list)
    pending: Optional[dict[str, Any]] = None  # last quote waiting for «да»
    last_order_id: Optional[int] = None
    handed_off_at: float = 0.0


_chats: dict[str, Chat] = {}
_seen: dict[str, float] = {}
_menu_cache: dict[str, Any] = {"at": 0.0, "text": "", "ids": set()}


def enabled() -> bool:
    return os.getenv("DAM_WA_ENABLED", "0").strip().lower() in {"1", "true", "yes", "on"}


def hook_key() -> str:
    return (os.getenv("DAM_WA_HOOK_KEY") or os.getenv("WAHA_API_KEY") or "").strip()


def _waha() -> tuple[str, dict[str, str], str]:
    return (os.getenv("WAHA_DAM_URL", "http://waha-dam:3000").rstrip("/"),
            {"X-Api-Key": os.getenv("WAHA_API_KEY", "").strip()},
            os.getenv("WAHA_DAM_SESSION", "default"))


def _chat(chat_id: str) -> Chat:
    now = time.time()
    c = _chats.get(chat_id)
    if c is None:
        c = _chats[chat_id] = Chat()
    if now - c.updated > HISTORY_TTL:
        c.turns, c.pending = [], None
    c.updated = now
    return c


def _duplicate(message_id: str) -> bool:
    now = time.time()
    for k in [k for k, t in _seen.items() if now - t > 3600]:
        _seen.pop(k, None)
    if not message_id:
        return False
    if message_id in _seen:
        return True
    _seen[message_id] = now
    return False


def money(v: Any) -> str:
    try:
        return f"{int(round(float(v))):,}".replace(",", " ") + " ₸"
    except (TypeError, ValueError):
        return str(v)


# ── menu & facts for the AI ─────────────────────────────────────────────────

async def menu_text(db) -> str:
    """Compact menu with ids, prices and required choices — the only source of dishes for the AI."""
    if time.time() - _menu_cache["at"] < 60 and _menu_cache["text"]:
        return _menu_cache["text"]
    from services.menu_configuration import catalog
    cur = await catalog(db)
    cats = {c["id"]: c["name"] for c in cur.get("categories", [])}
    lines, ids = [], set()
    by_cat: dict[str, list[dict]] = {}
    for p in cur.get("products", []):
        if not p.get("sellable"):
            continue
        by_cat.setdefault(cats.get(p.get("category_id"), "Комбо" if p.get("is_combo") else "Другое"), []).append(p)
    for cat, items in by_cat.items():
        lines.append(f"\n[{cat}]")
        for p in items:
            ids.add(p["id"])
            desc = re.sub(r"\s+", " ", str(p.get("description") or "")).strip()
            lines.append(f"#{p['id']} {p['name']} — {money(p['price'])}" + (f" ({desc[:110]})" if desc else ""))
            for g in p.get("modifier_groups") or []:
                opts = ", ".join(f"option_id {o['id']}: {o['name']}" + (f" +{money(o.get('price'))}" if float(o.get('price') or 0) else "")
                                 for o in g.get("options", []) if o.get("is_active", True) is not False)
                lower = max(int(g.get("min_select") or 0), 1 if g.get("is_required") else 0)
                rule = "обязательно выбрать 1" if lower and g.get("type") == "single" else (f"выбрать от {lower}" if lower else "по желанию")
                lines.append(f"   • {g['name']} ({rule}): {opts}")
            combo = p.get("combo") or {}
            for g in combo.get("groups") or []:
                opts = ", ".join(f"item_id {o['item_id']}: {o.get('name', '')}" + (f" +{money(o.get('surcharge'))}" if float(o.get('surcharge') or 0) else "")
                                 for o in g.get("options", []) if o.get("available"))
                lines.append(f"   • в комбо «{g['name']}» (group_id {g['id']}, выбрать {g.get('min_select', 1)}): {opts}")
    text = "\n".join(lines).strip() or "Меню сейчас пустое."
    _menu_cache.update(at=time.time(), text=text, ids=ids)
    return text


async def store_facts(db) -> str:
    from services.food_settings import Food_settingsService
    from services.food_order_validation import kitchen_is_open
    s = await Food_settingsService(db).get_all_as_dict()
    open_now, opens, closes = kitchen_is_open(s)
    parts = [
        f"Кухня сейчас {'ОТКРЫТА' if open_now else 'ЗАКРЫТА'}" + (f", принимаем заказы с {opens} до {closes}" if opens else ""),
        f"Время доставки: {s.get('delivery_time') or '35–45'} мин",
    ]
    if s.get("min_order_amount"):
        parts.append(f"Минимальный заказ: {money(s.get('min_order_amount'))}")
    if s.get("free_delivery_from"):
        parts.append(f"Бесплатная доставка от {money(s.get('free_delivery_from'))}")
    if not open_now:
        parts.append("Когда кухня закрыта, можно оформить предзаказ: вызови get_preorder_slots и предложи время.")
    text = ". ".join(parts) + "."
    from services.food_order_validation import _parse_loyalty_gifts, _parse_promo_codes
    gifts = _parse_loyalty_gifts(s)
    if gifts:
        by_sum: dict[float, list[str]] = {}
        for g in gifts:
            by_sum.setdefault(g["min_amount"], []).append(g["title"] + (f" (selected_gift_id «{g['id']}»)"))
        text += "\nПодарки к заказу (бесплатно, клиент выбирает один из уровня по сумме блюд): " + "; ".join(
            f"от {money(k)} — " + " или ".join(v) for k, v in sorted(by_sum.items()))
    promos = []
    for pr in _parse_promo_codes(s.get("promo_codes") or "[]"):
        if not isinstance(pr, dict) or pr.get("active") is False or str(pr.get("active", "")).lower() in ("0", "false", "no", "off"):
            continue
        kind = {"percent": f"−{pr.get('value')}%", "fixed": f"−{money(pr.get('value'))}", "free_delivery": "бесплатная доставка"}.get(str(pr.get("type") or "percent"), "скидка")
        promos.append(f"{str(pr.get('code', '')).upper()}: {kind}" + (f" от {money(pr.get('min_order'))}" if float(pr.get("min_order") or 0) else "")
                      + (f" ({pr.get('label')})" if pr.get("label") else ""))
    if promos:
        text += "\nДействующие промокоды (предлагай подходящий по сумме и подставляй в promo_code): " + "; ".join(promos[:8])
    return text


def system_prompt(facts: str, name: str) -> str:
    return f"""Ты — продавец-консультант доставки еды DAM ALEM 2.0 (район Сортировка, Караганда) в WhatsApp.
Пиши на языке клиента (русский или казахский), тепло, живо и по-доброму, как приветливый официант.
Клиент: {name or 'имя пока неизвестно'}.

Оформление сообщений (это WhatsApp):
- Короткие абзацы, между блоками — пустая строка. Никогда не пиши всё одним сплошным текстом.
- Каждое блюдо — с новой строки, со своим эмодзи: 🍔 бургеры, 🍕 пицца, 🍟 закуски, 🥟 манты, 🍜 горячее, 🥤 напитки, ☕ кофе, 🍵 чай, 🥛 коктейли, 🎁 подарок.
  Пример: 🍕 *Пепперони* — 3 200 ₸
- Жирный шрифт — одна звёздочка с двух сторон: *так*. Не используй **, #, таблицы и ссылки в скобках.
- В одном сообщении показывай не больше 5–6 блюд; полное меню с фото — ссылкой.
- 2–4 уместных эмодзи на сообщение (😊🔥👌🧡), без перебора.
- Итог заказа после quote_order оформляй строго так:
🧾 *Ваш заказ:*
🍕 Пепперони × 1 — 3 200 ₸
🥤 Coca-Cola 1 л × 1 — 800 ₸

🚚 Доставка: ул. ..., кв. ... (или 🏃 Самовывоз)
💳 Оплата: наличными / Kaspi / Halyk
💰 *Итого: 4 000 ₸*

Чтобы оформить, ответьте *Да* ✅

Сейчас: {facts}

Как продавать (ты продавец, твоя цель — вкусный и выгодный для клиента заказ на хорошую сумму):
- Узнай, на сколько человек и что любят. Сразу предлагай 2–3 конкретных блюда или комбо с ценой — не перечисляй всё меню.
- Обязательно, до расчёта, сделай одно дружелюбное допредложение (один раз, без давления):
  • к пицце и бургерам — соус (если у блюда есть соусы в меню) и напиток 🥤;
  • к одному блюду — закуску: картофель фри, наггетсы, луковые кольца 🍟;
  • если людей несколько — комбо или вторую пиццу.
  Пример: «К пицце отлично зайдёт *Сырный соус* (+300 ₸) и холодная *Coca-Cola 1 л* (800 ₸) 🥤 Добавить?»
- Следи за суммой блюд. Если до подарка или бесплатной доставки осталось немного (до ~3 000 ₸) — скажи сколько и что можно добавить: «Ещё 1 200 ₸ — и *подарок* 🎁 бесплатно!»
- Если сумма уже дотягивает до подарка — обязательно скажи о нём и спроси, какой подарок выбрать (selected_gift_id в quote_order).
- Если подходит промокод — предложи его и подставь в promo_code.
- Блюда, цены и варианты бери ТОЛЬКО из get_menu. Никогда не выдумывай блюда, цены, скидки и сроки.
- Если у блюда есть обязательный выбор (размер, количество, состав комбо) — уточни у клиента.
- Для заказа нужны: блюда и количество, имя, доставка (адрес: улица и дом, подъезд/квартира) или самовывоз, оплата: наличными (спроси, с какой суммы сдача), Kaspi или Halyk (счёт придёт в приложение банка на номер клиента). Спрашивай недостающее по одному вопросу.
- Когда всё собрано — вызови quote_order. Покажи клиенту итог из ответа инструмента по образцу выше (блюда, доставка, оплата, итого) и попроси ответить «Да».
- Сам ты заказ не создаёшь: его создаст система, когда клиент ответит «Да». Не пиши «заказ оформлен», пока система этого не сообщила.
- Если quote_order вернул ошибку (адрес не найден, минимальная сумма, кухня закрыта) — объясни простыми словами и предложи решение.
- Статус уже сделанного заказа — get_my_last_order. Бонусы — get_bonus_balance.
- Если клиент просит живого человека, жалуется, проблема с оплатой или ты не можешь помочь — вызови call_operator и скажи, что сотрудник скоро напишет здесь.
- Не обсуждай посторонние темы. Никогда не проси коды из СМС, пароли и данные карт.
- Меню на сайте с фото: {SITE}/food"""


TOOLS = [
    {"name": "get_menu", "description": "Актуальное меню DAM ALEM: id блюд, цены, обязательные варианты (option_id) и состав комбо (group_id/item_id).",
     "input_schema": {"type": "object", "properties": {}}},
    {"name": "get_preorder_slots", "description": "Свободное время для предзаказа (когда кухня закрыта или клиент хочет к определённому времени).",
     "input_schema": {"type": "object", "properties": {}}},
    {"name": "quote_order", "description": "Точный расчёт заказа сервером (цены, доставка по адресу, промокод, подарок). Возвращает итог для показа клиенту.",
     "input_schema": {"type": "object", "required": ["items", "customer_name", "delivery_method", "payment_method"], "properties": {
         "items": {"type": "array", "items": {"type": "object", "required": ["id", "quantity"], "properties": {
             "id": {"type": "integer"}, "quantity": {"type": "integer", "minimum": 1, "maximum": 50},
             "modifiers": {"type": "array", "items": {"type": "object", "required": ["option_id"], "properties": {"option_id": {"type": "integer"}, "quantity": {"type": "integer"}}}},
             "choices": {"type": "array", "items": {"type": "object", "required": ["group_id", "item_id"], "properties": {"group_id": {}, "item_id": {"type": "integer"}}}}}}},
         "customer_name": {"type": "string"},
         "delivery_method": {"type": "string", "enum": ["delivery", "pickup"]},
         "delivery_address": {"type": "string", "description": "Улица и дом, подъезд, квартира. Город Караганда."},
         "payment_method": {"type": "string", "enum": ["cash", "kaspi_qr", "halyk_qr"]},
         "cash_given_amount": {"type": "number", "description": "С какой суммы нужна сдача (для наличных)"},
         "scheduled_for": {"type": "string", "description": "Время предзаказа из get_preorder_slots, если нужно"},
         "promo_code": {"type": "string"},
         "selected_gift_id": {"type": "string"},
         "comment": {"type": "string"}}}},
    {"name": "get_my_last_order", "description": "Статус последнего заказа этого клиента.", "input_schema": {"type": "object", "properties": {}}},
    {"name": "get_bonus_balance", "description": "Бонусы клиента.", "input_schema": {"type": "object", "properties": {}}},
    {"name": "call_operator", "description": "Позвать живого сотрудника DAM ALEM в этот чат.",
     "input_schema": {"type": "object", "required": ["reason"], "properties": {"reason": {"type": "string"}}}},
]

STATUS_RU = {"new": "принят, ждёт подтверждения", "accepted": "подтверждён", "preparing": "готовится", "ready": "готов",
             "in_progress": "в пути", "done": "выполнен", "cancelled": "отменён"}


def _quote_view(q: dict[str, Any]) -> str:
    try:
        items = json.loads(q.get("order_items") or "[]") if isinstance(q.get("order_items"), str) else (q.get("order_items") or [])
    except ValueError:
        items = []
    rows = []
    for it in items:
        mods = ", ".join(m.get("name", "") for m in it.get("modifiers") or [])
        rows.append(f"{it.get('name')} × {it.get('quantity')}" + (f" ({mods})" if mods else "") + f" — {money(it.get('sum', 0))}" + (" 🎁" if it.get("is_gift") else ""))
    return json.dumps({"позиции": rows, "к_оплате": money(q.get("total_amount")), "способ": q.get("delivery_method"),
                       "оплата": q.get("payment_method"), "предзаказ_на": q.get("scheduled_for"),
                       "сдача_с": q.get("cash_given_amount"), "комментарий": q.get("comment")}, ensure_ascii=False)


async def run_tool(db, ctx, chat: Chat, name: str, args: dict[str, Any], message_id: str, client: httpx.AsyncClient, chat_id: str) -> str:
    from fastapi import HTTPException
    from services import business_channel as C, crm
    try:
        if name == "get_menu":
            return await menu_text(db)
        if name == "get_preorder_slots":
            slots = await C.tool(db, ctx, "slots", {})
            return json.dumps(slots, ensure_ascii=False, default=str)[:3000]
        if name == "get_bonus_balance":
            return json.dumps(await C.tool(db, ctx, "bonus_balance", {}), ensure_ascii=False, default=str)[:1500]
        if name == "get_my_last_order":
            from sqlalchemy import select
            from models.food_orders import Food_orders
            row = await db.scalar(select(Food_orders).where(Food_orders.customer_id == ctx.customer_id).order_by(Food_orders.id.desc()).limit(1))
            if not row:
                return "У клиента ещё нет заказов."
            return json.dumps({"номер": row.id, "статус": STATUS_RU.get(row.status, row.status), "сумма": money(row.total_amount),
                               "оплата": row.payment_status}, ensure_ascii=False)
        if name == "call_operator":
            await notify_owner(client, chat_id, chat, str(args.get("reason") or ""))
            chat.muted_until = time.time() + 30 * 60  # give the human time; the bot stays quiet meanwhile
            return "Сотрудник уведомлён. Скажи клиенту, что сотрудник скоро напишет здесь."
        if name == "quote_order":
            draft = {k: v for k, v in args.items() if v not in (None, "")}
            from services.menu_configuration import restaurants
            rests = await restaurants(db, crm.DAM)
            draft["restaurant_id"] = rests[0].id if rests else 0
            for it in draft.get("items", []):
                it.setdefault("modifiers", [])
                it.setdefault("choices", [])
            q = await C.tool(db, ctx, "quote", draft, message_id=message_id)
            await db.commit()
            chat.pending = {"id": q["confirmation_id"], "total": q.get("total_amount"), "payment": q.get("payment_method"), "at": time.time()}
            return "Расчёт готов. Покажи клиенту и попроси ответить «Да»: " + _quote_view(q)
        return "Неизвестный инструмент"
    except HTTPException as exc:
        await db.rollback()
        return f"Ошибка: {exc.detail}"
    except Exception as exc:  # validation errors etc.
        await db.rollback()
        logger.warning("[DamWA] tool %s failed: %s", name, exc)
        return f"Ошибка: не получилось ({type(exc).__name__}). Проверь данные и попробуй ещё раз."


async def ask_ai(client: httpx.AsyncClient, db, ctx, chat: Chat, message_id: str, chat_id: str) -> Optional[str]:
    key = (os.getenv("ANTHROPIC_API_KEY") or "").strip()
    if not key:
        return None
    facts = await store_facts(db)
    messages = list(chat.turns[-HISTORY_TURNS:])
    while messages and messages[0]["role"] != "user":
        messages.pop(0)
    for _ in range(MAX_TOOL_ROUNDS):
        resp = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={"x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
            json={"model": os.getenv("DAM_WA_MODEL", "claude-haiku-5-5"), "max_tokens": 900,
                  "system": system_prompt(facts, chat.name), "tools": TOOLS, "messages": messages},
            timeout=60)
        resp.raise_for_status()
        data = resp.json()
        content = data.get("content", [])
        messages.append({"role": "assistant", "content": content})
        uses = [b for b in content if b.get("type") == "tool_use"]
        if not uses:
            return "".join(b.get("text", "") for b in content if b.get("type") == "text").strip()
        results = []
        for u in uses:
            out = await run_tool(db, ctx, chat, u["name"], u.get("input") or {}, message_id, client, chat_id)
            results.append({"type": "tool_result", "tool_use_id": u["id"], "content": out[:6000]})
        messages.append({"role": "user", "content": results})
    return "Секунду, уточняю детали — сотрудник подключится, если понадобится 🙏"


# ── WhatsApp I/O ────────────────────────────────────────────────────────────

async def send_text(client: httpx.AsyncClient, chat_id: str, text: str, chat: Chat) -> None:
    base, headers, session = _waha()
    text = text[:MAX_REPLY_CHARS]
    chat.sent = (chat.sent + [text.strip()])[-20:]
    try:
        await client.post(f"{base}/api/sendSeen", headers=headers, json={"session": session, "chatId": chat_id}, timeout=10)
    except httpx.HTTPError:
        pass
    r = await client.post(f"{base}/api/sendText", headers=headers, json={"session": session, "chatId": chat_id, "text": text}, timeout=20)
    r.raise_for_status()
    try:
        data = r.json()
        mid = data.get("id") if isinstance(data, dict) else None
        mid = mid.get("_serialized") if isinstance(mid, dict) else mid
        if mid:
            chat.sent_ids = (chat.sent_ids + [str(mid)])[-30:]
    except ValueError:
        pass


async def transcribe(client: httpx.AsyncClient, media: dict[str, Any]) -> Optional[str]:
    whisper = (os.getenv("WHISPER_URL") or "").rstrip("/")
    url = str((media or {}).get("url") or "")
    if not whisper or not url:
        return None
    base, headers, _ = _waha()
    url = re.sub(r"^https?://[^/]+", base, url)
    audio = await client.get(url, headers=headers, timeout=30)
    audio.raise_for_status()
    if len(audio.content) > 15 * 1024 * 1024:
        return None
    r = await client.post(f"{whisper}/asr", params={"task": "transcribe", "output": "txt", "encode": "true"},
                          files={"audio_file": ("voice.ogg", audio.content, media.get("mimetype") or "audio/ogg")}, timeout=120)
    r.raise_for_status()
    return r.text.strip() or None


async def notify_owner(client: httpx.AsyncClient, chat_id: str, chat: Chat, reason: str) -> None:
    from services.news_agent import approval_chat, bot_token, tg
    if not bot_token() or not approval_chat() or time.time() - chat.handed_off_at < 900:
        return
    chat.handed_off_at = time.time()
    history = "\n".join(f"{'👤' if t['role'] == 'user' else '🤖'} {html.escape(str(t['content'])[:250])}"
                        for t in chat.turns[-6:] if isinstance(t.get("content"), str))
    text = (f"🍔 <b>WhatsApp DAM ALEM: нужен сотрудник</b>\n<b>{html.escape(chat.name or 'Клиент')}</b> · {chat.phone or 'номер скрыт'}\n"
            f"Причина: {html.escape(reason[:200])}\n\n{history}\n\nОтветьте клиенту в WhatsApp DAM ALEM с телефона — бот в этом чате замолчит.")
    try:
        await tg(client, "sendMessage", {"chat_id": approval_chat(), "text": text[:4000], "parse_mode": "HTML"})
    except Exception as exc:
        logger.warning("[DamWA] owner notify failed: %s", exc)


@dataclass
class Outcome:
    action: str
    reply: str = ""


def _phone_from(chat_id: str, payload: dict[str, Any]) -> str:
    num = chat_id.split("@")[0]
    if chat_id.endswith("@c.us") and num.isdigit():
        return "+" + num
    alt = str((payload.get("_data") or {}).get("Info", {}).get("SenderAlt") or "")
    digits = re.sub(r"\D", "", alt.split("@")[0])
    return "+" + digits if len(digits) >= 10 else ""


async def handle_event(event: dict[str, Any], client: httpx.AsyncClient) -> Outcome:
    if not enabled() or event.get("event") not in ("message", "message.any"):
        return Outcome("ignored")
    p = event.get("payload") or {}
    chat_id = str((p.get("to") if p.get("fromMe") else p.get("from")) or "")
    if not chat_id or not re.search(r"@(c\.us|s\.whatsapp\.net|lid)$", chat_id) or chat_id.startswith("status@"):
        return Outcome("ignored")
    if _duplicate(str(p.get("id") or "")):
        return Outcome("ignored")
    chat = _chat(chat_id)
    now = time.time()
    body = str(p.get("body") or "").strip()
    if p.get("fromMe"):
        # Our own API messages come back as fromMe too: recognise them by source / id / text, never mute on them.
        norm = re.sub(r"\s+", " ", body)
        if (str(p.get("source") or "").lower() == "api" or str(p.get("id") or "") in chat.sent_ids
                or body.startswith("🔔") or any(norm == re.sub(r"\s+", " ", t) or (len(norm) > 40 and t.startswith(body[:40])) for t in chat.sent)):
            return Outcome("ignored")
        chat.muted_until = now + MUTE_AFTER_STAFF  # a person from DAM ALEM answered from the phone
        chat.pending = None
        if body:
            chat.turns.append({"role": "assistant", "content": body})
        return Outcome("muted")
    if now < chat.muted_until:
        if body:
            chat.turns.append({"role": "user", "content": body})
        return Outcome("muted")
    chat.recent = [t for t in chat.recent if now - t < 3600]
    if len(chat.recent) >= MAX_PER_HOUR:
        return Outcome("limited")
    chat.recent.append(now)
    data = p.get("_data") or {}
    chat.name = str(data.get("pushName") or data.get("notifyName") or (data.get("Info") or {}).get("PushName") or chat.name or "")
    chat.phone = chat.phone or _phone_from(chat_id, p)

    text = body
    media = p.get("media") if isinstance(p.get("media"), dict) else {}
    if p.get("hasMedia") and str(media.get("mimetype") or "").startswith("audio"):
        heard = None
        try:
            heard = await transcribe(client, media)
        except Exception as exc:
            logger.warning("[DamWA] transcribe failed: %s", exc)
        if not heard:
            reply = "Не получилось прослушать голосовое 🙏 Напишите, пожалуйста, текстом."
            await send_text(client, chat_id, reply, chat)
            return Outcome("replied", reply)
        text = heard
    elif p.get("hasMedia") and not text:
        text = "(прислал фото или файл)"
    if not text:
        return Outcome("ignored")

    from core.database import db_manager
    from services import business_channel as C, crm
    async with db_manager.async_session_maker() as db:
        # No phone (hidden WhatsApp id): ask for it once, then use it as the customer identity.
        if not chat.phone:
            digits = re.sub(r"\D", "", text)
            if 10 <= len(digits) <= 12:
                chat.phone = "+7" + digits[-10:]
                text = "Мой номер " + chat.phone
            else:
                chat.turns.append({"role": "user", "content": text[:2000]})
                reply = "Здравствуйте! Это DAM ALEM 2.0 🍔 Чтобы принять заказ, напишите, пожалуйста, ваш номер телефона."
                chat.turns.append({"role": "assistant", "content": reply})
                await send_text(client, chat_id, reply, chat)
                return Outcome("asked_phone", reply)
        ctx = await C.resolve_sender(db, business_id=crm.DAM, phone=chat.phone, provider_account=PROVIDER, signature_verified=True)
        await db.commit()

        # The customer's own «да» to the last calculation creates the order. The AI cannot do this.
        if chat.pending and YES_RE.match(text) and now - chat.pending["at"] < 10 * 60:
            pending, chat.pending = chat.pending, None
            try:
                await C.confirm_customer_reply(db, ctx, pending["id"], explicit_confirmation=True)
                order = await C.tool(db, ctx, "create_order", {"confirmation_id": pending["id"]})
                await db.commit()
            except Exception as exc:
                await db.rollback()
                detail = getattr(exc, "detail", None) or "не получилось оформить"
                reply = f"Не получилось оформить: {detail}. Давайте пересчитаем заказ — напишите «пересчитай»."
                chat.turns += [{"role": "user", "content": text}, {"role": "assistant", "content": reply}]
                await send_text(client, chat_id, reply, chat)
                return Outcome("confirm_failed", reply)
            chat.last_order_id = order.get("id")
            pay = pending.get("payment")
            pay_line = {"kaspi_qr": "💳 Счёт Kaspi придёт в приложение банка в течение 1–3 минут — оплатите уведомление «Оплатить». Готовить начнём после оплаты.",
                        "halyk_qr": "💳 Счёт Halyk придёт в приложение банка в течение 1–3 минут. Готовить начнём после оплаты."}.get(pay, "💵 Оплата при получении.")
            reply = (f"✅ *Заказ №{order.get('id')} оформлен!*\n\n💰 Сумма: *{money(order.get('total_amount'))}*\n{pay_line}\n\n"
                     f"📲 Статус заказа будем присылать сюда.\nСпасибо, что выбрали DAM ALEM 2.0 🧡")
            chat.turns += [{"role": "user", "content": text}, {"role": "assistant", "content": reply}]
            await send_text(client, chat_id, reply, chat)
            return Outcome("order_created", reply)
        if chat.pending and NO_RE.match(text):
            chat.pending = None

        chat.turns.append({"role": "user", "content": text[:2000]})
        if HUMAN_RE.search(text) and len(text) < 80:
            await notify_owner(client, chat_id, chat, text)
        reply: Optional[str] = None
        try:
            reply = await ask_ai(client, db, ctx, chat, str(p.get("id") or f"t{now}"), chat_id)
        except Exception as exc:
            logger.warning("[DamWA] AI failed: %s", exc)
        if not reply:
            reply = (f"Здравствуйте! Это DAM ALEM 2.0 🍔 Меню с ценами: {SITE}/food\n"
                     "Напишите, что хотите заказать, — сотрудник ответит здесь.")
            await notify_owner(client, chat_id, chat, "бот без ИИ: нужен ответ сотрудника")
        chat.turns.append({"role": "assistant", "content": reply})
        await send_text(client, chat_id, reply, chat)
        return Outcome("replied", reply)
