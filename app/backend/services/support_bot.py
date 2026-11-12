"""WhatsApp support bot for the «Сортировка 24» number (+7 700 428 02 80).

Messages reach us from our own WAHA server (webhook). The bot answers questions
about the platform only, hands a conversation to the owner (Telegram) when it
cannot help or the person asks for a human, and stays silent in a chat for a
while after the owner writes there himself from the phone.

Brain: Claude (ANTHROPIC_API_KEY). Without a key the bot still answers with a
short greeting + links and passes the question to the owner.
Voice notes: transcribed by our own Whisper server (WHISPER_URL) when present.

No new tables: short per-chat history lives in memory (lost on restart, fine
for support chat); handoffs and mutes are also in memory.
"""

from __future__ import annotations

import asyncio
import html
import logging
import os
import re
import time
from dataclasses import dataclass, field
from typing import Any, Optional

import httpx

from services import wa_guard, wa_login

logger = logging.getLogger(__name__)

SITE = "https://www.sortirovka24.kz"
HISTORY_TURNS = 12
HISTORY_TTL = 24 * 3600
MUTE_AFTER_OWNER = 12 * 3600
# The bot waits this long before answering, so the owner can reply first (then the bot stays silent),
# and a burst of several messages gets one answer.
REPLY_GRACE_SECONDS = float(os.getenv("SUPPORT_BOT_REPLY_GRACE", "45"))
MAX_PER_HOUR = 30
HANDOFF_TAG = "[ОПЕРАТОР]"
MAX_REPLY_CHARS = 1200
OWN_NUMBERS = {"+77470304096"}  # DAM ALEM sales bot number


@dataclass
class Chat:
    turns: list[dict[str, str]] = field(default_factory=list)
    updated: float = 0.0
    muted_until: float = 0.0
    handed_off_at: float = 0.0
    recent: list[float] = field(default_factory=list)
    name: str = ""
    sent: list[str] = field(default_factory=list)  # texts the bot itself sent (they come back as fromMe)
    last_user_at: float = 0.0


_chats: dict[str, Chat] = {}
# WhatsApp names one person by several ids (phone@c.us, phone@s.whatsapp.net, xxx@lid): all map to one chat key.
_aliases: dict[str, str] = {}
_seen_ids: dict[str, float] = {}


def enabled() -> bool:
    return os.getenv("SUPPORT_BOT_ENABLED", "1").strip().lower() not in {"0", "false", "no", "off"}


def hook_key() -> str:
    return (os.getenv("SUPPORT_BOT_HOOK_KEY") or os.getenv("WAHA_API_KEY") or "").strip()


def _bare(jid: str) -> str:
    """'77001234567:12@s.whatsapp.net' / '77001234567@c.us' → '77001234567@c.us'; lids keep their own form."""
    jid = (jid or "").strip()
    if not jid or "@" not in jid:
        return ""
    user, server = jid.split("@", 1)
    user = user.split(":", 1)[0]
    return f"{user}@lid" if server == "lid" else f"{user}@c.us"


def _peer_ids(p: dict[str, Any]) -> list[str]:
    """Every id WhatsApp gives for the OTHER person in this chat (never our own number)."""
    info = (p.get("_data") or {}).get("Info") or {}
    if p.get("fromMe"):
        cands = [p.get("to"), info.get("Chat"), info.get("RecipientAlt"), info.get("ChatAlt")]
    else:
        cands = [p.get("from"), info.get("Chat"), info.get("Sender"), info.get("SenderAlt"), info.get("ChatAlt")]
    seen: list[str] = []
    for c in cands:
        jid = _bare(str(c or ""))
        if jid and jid not in seen:
            seen.append(jid)
    return seen


def _chat_key(p: dict[str, Any]) -> str:
    """One key per person: the first id seen for them; every other id of theirs is remembered as an alias."""
    ids = _peer_ids(p)
    if not ids:
        return ""
    key = next((_aliases[i] for i in ids if i in _aliases), ids[0])
    for i in ids:
        _aliases[i] = key
    return key


def _chat(chat_id: str) -> Chat:
    now = time.time()
    c = _chats.get(chat_id)
    if c is None:
        c = _chats[chat_id] = Chat()
    if now - c.updated > HISTORY_TTL:
        c.turns = []
    c.updated = now
    return c


def _duplicate(message_id: str) -> bool:
    now = time.time()
    for k in [k for k, t in _seen_ids.items() if now - t > 3600]:
        _seen_ids.pop(k, None)
    if not message_id:
        return False
    if message_id in _seen_ids:
        return True
    _seen_ids[message_id] = now
    return False


# ── knowledge ───────────────────────────────────────────────────────────────

MODULE_INFO = {
    "food": ("DÄM ALEM — доставка еды", f"{SITE}/food", "меню, корзина, доставка или самовывоз, оплата наличными, Kaspi или Halyk, бонусы"),
    "news": ("Новости", f"{SITE}/news", "свежие новости Караганды, района Сортировка и Казахстана"),
    "transport": ("Транспорт", f"{SITE}/transport", "расписание и маршруты автобусов"),
    "directory": ("Справочник", f"{SITE}/directory", "полезные телефоны и организации района"),
    "business": ("Бизнес и партнёрство", f"{SITE}/business", "каталог местного бизнеса; заявка, чтобы стать партнёром портала"),
    "inspectors": ("Участковые инспекторы", f"{SITE}/inspectors", "найти своего участкового по адресу"),
    "announcements": ("Объявления", f"{SITE}/announcements", "частные объявления жителей"),
    "jobs": ("Работа", f"{SITE}/jobs", "вакансии района"),
    "masters": ("Мастера", f"{SITE}/masters", "мастера и услуги рядом"),
    "real_estate": ("Недвижимость", f"{SITE}/real-estate", "аренда и продажа жилья"),
    "complaints": ("Жалобы", f"{SITE}/complaints", "сообщить о проблеме в районе"),
}


DAM_ALEM_WHATSAPP = "+7 747 030 40 96"
DAM_ALEM_WA_LINK = "https://wa.me/77470304096"
DAM_ALEM_ASK = re.compile(r"д[аә]м\s*[аә]лем|d[aä]m\s*alem|заказать\s+еду|\bменю\b")


def directory_block(entries: list[dict[str, str]]) -> str:
    """The district directory as compact lines the bot may quote: only what is published on the site."""
    lines, category = [], None
    for e in entries:
        if e.get("category") != category:
            category = e.get("category")
            lines.append(f"[{category or 'Разное'}]")
        parts = [e.get("name") or ""]
        for key, label in (("phone", "тел."), ("whatsapp", "WhatsApp"), ("address", "адрес"), ("hours", "часы")):
            if e.get(key):
                parts.append(f"{label} {e[key]}")
        lines.append("- " + "; ".join(p for p in parts if p))
    return "\n".join(lines)


def menu_block(menu: list[dict[str, str]]) -> str:
    """DÄM ALEM's live menu: categories with dishes and prices, exactly as on the site."""
    lines, category = [], None
    for m in menu:
        if m.get("category") != category:
            category = m.get("category")
            lines.append(f"[{category or 'Разное'}]")
        lines.append(f"- {m.get('name')} — {m.get('price')} ₸")
    return "\n".join(lines)


def system_prompt(modules: dict[str, bool], directory: Optional[list[dict[str, str]]] = None,
                  menu: Optional[list[dict[str, str]]] = None) -> str:
    on = [MODULE_INFO[k] for k, v in modules.items() if v and k in MODULE_INFO]
    sections = "\n".join(f"- {t}: {u} — {d}" for t, u, d in on) or "- (разделы уточняются)"
    contacts = directory_block(directory or [])
    directory_part = (
        f"\nСправочник района (это опубликовано на {SITE}/directory — отвечай телефонами и адресами ТОЛЬКО отсюда, дословно):\n{contacts}\n"
        if contacts else f"\nСправочник района: {SITE}/directory\n"
    )
    dishes = menu_block(menu or [])
    menu_part = f"Меню сейчас (цены с сайта, называй только их):\n{dishes}\n" if dishes else ""
    return f"""Ты — помощник поддержки портала «Сортировка 24» (sortirovka24.kz) в WhatsApp. Портал района Сортировка в Караганде.
Отвечай на языке собеседника (русский или казахский), коротко, тепло и по-доброму.
Пиши как живой, внимательный человек из команды района, а не как робот: обращайся по имени, если оно известно; отвечай по сути первой же фразой; без канцелярита («Ваш запрос принят», «Уважаемый клиент»); если вопрос неясен — задай один уточняющий вопрос; не повторяй приветствие в каждом сообщении; на «спасибо» — коротко и по-доброму.
Если спросят, бот ты или человек, — честно скажи, что ты автоматический помощник «Сортировки 24», и предложи позвать живого человека.
Тебе могут прислать голосовое (ты получаешь его расшифровку) или фото. По фото: опиши коротко, что видишь, и помоги по делу (скриншот ошибки сайта — объясни, что делать; фото товара — подскажи, как подать объявление; фото документа с личными данными — не пересказывай данные). Если по фото непонятно, что нужно, — спроси.
Оформление (это WhatsApp): короткие абзацы с пустой строкой между ними, не сплошным текстом; списки — каждый пункт с новой строки со своим эмодзи; жирный — одной звёздочкой: *так* (не **, не #); 1–3 уместных эмодзи.

Сейчас на портале работают разделы:
{sections}

Как всё устроено:
- Вход и регистрация на сайте — только по номеру телефона, через WhatsApp или Telegram. Для WhatsApp на сайте есть кнопка: человек сам отправляет на этот номер готовое сообщение «Вход на Сортировка 24: код» и сразу входит. Пароль не нужен. За регистрацию — 300 бонусов, тратятся в DÄM ALEM (1 бонус = 1 ₸ скидки).
- Личный кабинет: {SITE}/cabinet — история заказов, бонусы, уведомления, адреса, удаление аккаунта (подтверждается кодом).
- Приложение: открыть сайт в Chrome (Android) и нажать «Установить»; на iPhone — «Поделиться» → «На экран Домой».
- Заказать еду: {SITE}/food — нажать «+» на блюде, затем «Оформить»: корзина и оформление на одном экране (адрес, время, оплата), кнопка «Заказать»; можно и без входа на сайт. Сервисного сбора нет — только цены блюд и доставка. Статус заказа виден в кабинете, там же кнопка «Отследить».
- «Мой дом» ({SITE}/dom): свой дом на портале — новости и объявления дома, связь с соседями. Чтобы вступить: открыть {SITE}/dom, войти по номеру телефона и указать улицу, дом и подъезд; в разделе есть личная ссылка, чтобы пригласить соседей. Если раздел попросит подтвердить, что вы живёте в доме, — следуйте подсказке на экране.
- Оплата в DÄM ALEM: наличными при получении или Kaspi/Halyk. При Kaspi/Halyk клиент указывает номер, оператор выставляет счёт в приложение банка (обычно 1–3 минуты), клиент оплачивает уведомление «Оплатить». Готовить начинают после оплаты. Если счёт долго не приходит — передай оператору.
- Стать партнёром (кафе, магазин, услуги): заявка на {SITE}/business — с вами свяжутся.
- Политика конфиденциальности: {SITE}/legal/privacy. Почта поддержки: srt-group.24@mail.ru.
- Такси на портале пока не работает.
- Бонусы DÄM ALEM: 300 за регистрацию, 2% с каждого заказа возвращаются бонусами, бонусами можно оплатить до 20% еды.
- Объявления жителей на сайте ({SITE}/announcements) — бесплатно, публикуются после проверки. Платное размещение в канале «Сортировка Официал» (около 30 000 подписчиков): бизнес — 5 000 ₸, недвижимость и услуги — 3 000 ₸, вакансии и частные объявления — 1 500 ₸; для оформления передай оператору.
- Свой интернет-магазин или витрина для бизнеса на портале: условия обсуждает владелец — передай оператору.
{directory_part}
DÄM ALEM (кафе-доставка: бургеры, пицца, закуски, коктейли, чаи):
- Если спрашивают про DÄM ALEM, еду, меню, доставку или хотят заказать — дай ссылку на меню {SITE}/food и WhatsApp DÄM ALEM для заказа и вопросов: {DAM_ALEM_WHATSAPP} ({DAM_ALEM_WA_LINK}). Скажи, что там ответят по наличию и времени доставки.
- Наш номер — поддержка портала, заказы здесь не принимаем.
{menu_part}
Правила:
- Ты живой консультант по проекту «Сортировка 24»: подробно и по-человечески объясняй, как пользоваться порталом, разделами, кабинетом, объявлениями, бонусами, как стать партнёром. На темы, не связанные с порталом и районом, вежливо скажи, что помогаешь только по порталу.
- Если нужного телефона нет в справочнике выше — не придумывай, дай ссылку {SITE}/directory.
- Никогда не выдумывай цены (кроме цен из меню выше), время работы, сроки доставки, наличие блюд, статусы конкретных заказов и личные данные — ты их не видишь. В таких случаях дай ссылку или передай оператору.
- Никогда не проси коды из сообщений, пароли и данные карт. Если человек прислал код — скажи, что код никому сообщать нельзя.
- Если человек просит живого человека, жалуется, у него проблема с конкретным заказом или оплатой, или ты не знаешь ответа — ответь, что передал вопрос оператору и он скоро напишет здесь же, и добавь в самом конце ответа метку {HANDOFF_TAG}.
- Не обещай того, чего нет на портале."""


def fallback_reply(text: str) -> tuple[str, bool]:
    """Without the AI key: greet, give links, hand every real question to the owner."""
    low = text.lower()
    if re.fullmatch(r"\s*(привет|здравствуй\w*|салем\w*|сәлем\w*|добр\w+ \w+|hi|hello)[!. ]*", low):
        return ("Здравствуйте! Это поддержка портала «Сортировка 24» 👋\n"
                f"Заказать еду DÄM ALEM: {SITE}/food\nЛичный кабинет: {SITE}/cabinet\n"
                "Напишите ваш вопрос — ответим здесь."), False
    if DAM_ALEM_ASK.search(low):
        return (f"DÄM ALEM 🍔\nМеню и заказ на сайте: {SITE}/food\n"
                f"WhatsApp DÄM ALEM: {DAM_ALEM_WHATSAPP} — {DAM_ALEM_WA_LINK}"), False
    return ("Спасибо! Передал ваш вопрос оператору — он ответит здесь же в ближайшее время.\n"
            f"Пока можно заглянуть на {SITE}"), True


async def ask_ai(client: httpx.AsyncClient, chat: Chat, modules: dict[str, bool],
                 directory: Optional[list[dict[str, str]]] = None,
                 menu: Optional[list[dict[str, str]]] = None,
                 image: Optional[tuple[str, str]] = None) -> Optional[str]:
    """image = (media_type, base64) of a photo attached to the latest message; it is sent once, not kept in history."""
    key = (os.getenv("ANTHROPIC_API_KEY") or "").strip()
    if not key:
        return None
    messages = [dict(t) for t in chat.turns[-HISTORY_TURNS:]]
    if image and messages and messages[-1]["role"] == "user":
        messages[-1]["content"] = [{"type": "image", "source": {"type": "base64", "media_type": image[0], "data": image[1]}},
                                   {"type": "text", "text": messages[-1]["content"]}]
    resp = await client.post(
        "https://api.anthropic.com/v1/messages",
        headers={"x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
        json={"model": os.getenv("SUPPORT_BOT_MODEL", "claude-haiku-5-5"), "max_tokens": 900,
              "system": system_prompt(modules, directory, menu), "messages": messages},
        timeout=40,
    )
    resp.raise_for_status()
    return "".join(p.get("text", "") for p in resp.json().get("content", []) if p.get("type") == "text").strip()


# ── WAHA I/O ────────────────────────────────────────────────────────────────

def _waha() -> tuple[str, dict[str, str]]:
    return (os.getenv("WAHA_URL", "http://waha:3000").rstrip("/"),
            {"X-Api-Key": os.getenv("WAHA_API_KEY", "").strip()})


async def send_text(client: httpx.AsyncClient, chat_id: str, text: str) -> bool:
    """The only way this number sends anything. False when the hourly/daily limits say «stay silent»."""
    if not wa_guard.allow(chat_id):
        logger.info("[SupportBot] send limit reached — staying silent")
        return False
    base, headers = _waha()
    session = os.getenv("WAHA_SESSION", "default")
    try:  # look human: mark read and "typing…" briefly
        await client.post(f"{base}/api/sendSeen", headers=headers, json={"session": session, "chatId": chat_id}, timeout=10)
    except httpx.HTTPError:
        pass
    try:
        r = await client.post(f"{base}/api/sendText", headers=headers,
                              json={"session": session, "chatId": chat_id, "text": text[:MAX_REPLY_CHARS]}, timeout=20)
        r.raise_for_status()
    except httpx.HTTPError:
        await wa_guard.failed()
        raise
    wa_guard.sent(chat_id)
    return True


async def transcribe(client: httpx.AsyncClient, media: dict[str, Any]) -> Optional[str]:
    """Voice note → text through our Whisper server. None when not available."""
    whisper = (os.getenv("WHISPER_URL") or "").rstrip("/")
    url = str((media or {}).get("url") or "")
    if not whisper or not url:
        return None
    base, headers = _waha()
    # WAHA builds media links with its own public base; fetch them through the internal address.
    url = re.sub(r"^https?://[^/]+", base, url)
    audio = await client.get(url, headers=headers, timeout=30)
    audio.raise_for_status()
    if len(audio.content) > 15 * 1024 * 1024:
        return None
    r = await client.post(f"{whisper}/asr", params={"task": "transcribe", "output": "txt", "encode": "true"},
                          files={"audio_file": ("voice.ogg", audio.content, media.get("mimetype") or "audio/ogg")},
                          timeout=120)
    r.raise_for_status()
    return r.text.strip() or None


IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
MAX_IMAGE_BYTES = 5 * 1024 * 1024


async def fetch_image(client: httpx.AsyncClient, media: dict[str, Any]) -> Optional[tuple[str, str]]:
    """A photo the person sent → (media_type, base64) for the AI. None for other files or too big."""
    import base64
    kind = str((media or {}).get("mimetype") or "").split(";")[0].strip().lower()
    url = str((media or {}).get("url") or "")
    if kind not in IMAGE_TYPES or not url:
        return None
    base, headers = _waha()
    r = await client.get(re.sub(r"^https?://[^/]+", base, url), headers=headers, timeout=30)
    r.raise_for_status()
    if not r.content or len(r.content) > MAX_IMAGE_BYTES:
        return None
    return kind, base64.b64encode(r.content).decode()


async def notify_owner(client: httpx.AsyncClient, chat_id: str, chat: Chat, last: str) -> None:
    """Tell the owner in Telegram that a person needs a human."""
    from services.news_agent import approval_chat, bot_token, owner_send
    if not bot_token() or not approval_chat():
        return
    who = html.escape(chat.name or "Клиент")
    number = chat_id.split("@")[0]
    phone = f"+{number}" if chat_id.endswith("@c.us") and number.isdigit() else "номер скрыт WhatsApp"
    history = "\n".join(f"{'👤' if t['role'] == 'user' else '🤖'} {html.escape(t['content'][:300])}" for t in chat.turns[-6:])
    text = (f"💬 <b>WhatsApp «Сортировка 24»: нужен оператор</b>\n\n<b>{who}</b> · {phone}\n\n{history}\n\n"
            "Ответьте человеку в WhatsApp с телефона +7 700 428 02 80 — бот в этом чате замолчит на 12 часов.")
    try:
        await owner_send(client, "support", "sendMessage", {"text": text[:4000], "parse_mode": "HTML"})
    except Exception as exc:
        logger.warning("[SupportBot] owner notify failed: %s", exc)


# ── main entry ──────────────────────────────────────────────────────────────

async def _modules() -> dict[str, bool]:
    try:
        from core.database import db_manager
        from sqlalchemy import select
        from models.module_settings import ModuleSettings
        async with db_manager.async_session_maker() as db:
            rows = (await db.execute(select(ModuleSettings))).scalars().all()
        found = {r.key: str(r.value).lower() == "true" for r in rows if r.key in MODULE_INFO}
        return found or {k: k in {"food", "news", "transport", "directory", "business", "inspectors"} for k in MODULE_INFO}
    except Exception:
        return {k: k in {"food", "news", "transport", "directory", "business", "inspectors"} for k in MODULE_INFO}


_directory_cache: tuple[float, list[dict[str, str]]] = (0.0, [])
_menu_cache: tuple[float, list[dict[str, str]]] = (0.0, [])


async def _menu() -> list[dict[str, str]]:
    """DÄM ALEM dishes that are on sale now, refreshed every 10 minutes."""
    global _menu_cache
    if time.time() - _menu_cache[0] < 600:
        return _menu_cache[1]
    try:
        from core.database import db_manager
        from sqlalchemy import select
        from models.food_categories import Food_categories as C
        from models.food_items import Food_items as I
        async with db_manager.async_session_maker() as db:
            rows = (await db.execute(
                select(I.name, I.price, C.name).outerjoin(C, C.id == I.category_id)
                .where(I.is_active.is_(True), I.available.isnot(False), I.archived_at.is_(None),
                       (I.business_id == "dam_alem") | I.business_id.is_(None))
                .order_by(C.sort_order, I.sort_order, I.id).limit(200)
            )).all()
        menu = [{"category": c or "", "name": n or "", "price": f"{p:,.0f}".replace(",", " ")} for n, p, c in rows if n and p]
        _menu_cache = (time.time(), menu)
    except Exception as exc:
        logger.warning("[SupportBot] menu load failed: %s", exc)
    return _menu_cache[1]


async def _directory() -> list[dict[str, str]]:
    """Published directory entries, refreshed every 10 minutes."""
    global _directory_cache
    if time.time() - _directory_cache[0] < 600:
        return _directory_cache[1]
    try:
        from core.database import db_manager
        from sqlalchemy import select
        from models.directory_entries import Directory_entries as D
        async with db_manager.async_session_maker() as db:
            rows = (await db.execute(
                select(D).where(D.is_published.isnot(False)).order_by(D.category, D.sort_order, D.id).limit(300)
            )).scalars().all()
        entries = [{"category": r.category or "", "name": r.entry_name or "", "phone": r.phone or "",
                    "whatsapp": r.whatsapp or "", "address": r.address or "", "hours": r.opening_hours or ""} for r in rows]
        _directory_cache = (time.time(), entries)
    except Exception as exc:
        logger.warning("[SupportBot] directory load failed: %s", exc)
    return _directory_cache[1]


@dataclass
class Outcome:
    action: str  # ignored | muted | replied | handed_off | limited | login
    reply: str = ""


async def handle_event(event: dict[str, Any], client: httpx.AsyncClient, modules: Optional[dict[str, bool]] = None) -> Outcome:
    if not enabled() or event.get("event") not in ("message", "message.any"):
        return Outcome("ignored")
    p = event.get("payload") or {}
    chat_id = str(p.get("from") or "")
    if p.get("fromMe"):
        chat_id = str(p.get("to") or "")
    # Only private chats: no groups, channels, status updates or broadcast lists.
    if not chat_id or not re.search(r"@(c\.us|s\.whatsapp\.net|lid)$", chat_id) or chat_id.startswith("status@"):
        return Outcome("ignored")
    if _duplicate(str(p.get("id") or "")):
        return Outcome("ignored")
    # Never talk to another bot of ours (DAM ALEM sales number), whatever id format WhatsApp uses.
    from services.dam_wa_bot import _phone_from
    if _phone_from(chat_id, p) in OWN_NUMBERS:
        return Outcome("ignored")
    chat = _chat(_chat_key(p) or chat_id)
    now = time.time()
    code = None if p.get("fromMe") else wa_login.login_code(str(p.get("body") or ""))
    if code:  # «Вход на Сортировка 24: 4821» — a sign-in, never a question for the AI
        from core.database import db_manager
        async with db_manager.async_session_maker() as db:
            reply = await wa_login.confirm(db, p, code)
        if reply:
            chat.sent = (chat.sent + [reply])[-20:]
            await send_text(client, chat_id, reply)
        return Outcome("login", reply)
    if p.get("fromMe"):
        body = str(p.get("body") or "").strip()
        if body.startswith(("Ваш код для входа", "🔔 Сортировка 24")) or body in chat.sent or body in wa_login.REPLIES:
            return Outcome("ignored")  # our own login code or bot reply echoed back
        # The owner wrote from the phone: the human takes over this chat for a while.
        chat.muted_until = now + MUTE_AFTER_OWNER
        if body:
            chat.turns.append({"role": "assistant", "content": body})
        return Outcome("muted")
    if now < chat.muted_until:
        if p.get("body"):
            chat.turns.append({"role": "user", "content": str(p.get("body"))})
        return Outcome("muted")
    chat.recent = [t for t in chat.recent if now - t < 3600]
    if len(chat.recent) >= MAX_PER_HOUR:
        return Outcome("limited")
    chat.recent.append(now)
    chat.name = str((p.get("_data") or {}).get("pushName") or (p.get("_data") or {}).get("notifyName") or chat.name or "")

    text = str(p.get("body") or "").strip()
    media = p.get("media") if isinstance(p.get("media"), dict) else {}
    is_voice = bool(p.get("hasMedia")) and str(media.get("mimetype") or "").startswith("audio")
    if is_voice:
        heard = None
        try:
            heard = await transcribe(client, media)
        except Exception as exc:
            logger.warning("[SupportBot] transcribe failed: %s", exc)
        if not heard:
            reply = "Пока не получилось прослушать голосовое 🙏 Напишите, пожалуйста, вопрос текстом."
            chat.sent = (chat.sent + [reply])[-20:]
            await send_text(client, chat_id, reply)
            return Outcome("replied", reply)
        text = heard
    image = None
    if p.get("hasMedia") and not is_voice:
        try:
            image = await fetch_image(client, media)
        except Exception as exc:
            logger.warning("[SupportBot] photo download failed: %s", exc)
        if image:
            text = f"[прислал фото] {text}".strip()
        elif not text:
            text = "(прислал файл без подписи)"
    if not text:
        return Outcome("ignored")
    chat.turns.append({"role": "user", "content": text[:2000]})
    arrived = chat.last_user_at = time.time()
    if REPLY_GRACE_SECONDS > 0:
        await asyncio.sleep(REPLY_GRACE_SECONDS)
        if time.time() < chat.muted_until:
            return Outcome("muted")  # the owner answered while the bot was waiting
        if chat.last_user_at != arrived:
            return Outcome("ignored")  # a newer message came in; that one gets the answer
    if not wa_guard.allow(chat_id):
        return Outcome("limited")  # the number's hourly/daily limit: stay silent, the owner still sees the chat

    reply: Optional[str] = None
    handoff = False
    try:
        reply = await ask_ai(client, chat, modules if modules is not None else await _modules(),
                             await _directory(), await _menu(), image)
    except Exception as exc:
        logger.warning("[SupportBot] AI failed: %s", exc)
    if reply is None:
        reply, handoff = fallback_reply(text)
    if HANDOFF_TAG in reply:
        handoff = True
        reply = reply.replace(HANDOFF_TAG, "").strip()
    reply = reply or "Передал ваш вопрос оператору — он скоро ответит здесь."
    chat.turns.append({"role": "assistant", "content": reply})
    chat.sent = (chat.sent + [reply[:MAX_REPLY_CHARS].strip()])[-20:]
    await send_text(client, chat_id, reply)
    if handoff and now - chat.handed_off_at > 1800:
        chat.handed_off_at = now
        await notify_owner(client, chat_id, chat, text)
    return Outcome("handed_off" if handoff else "replied", reply)
