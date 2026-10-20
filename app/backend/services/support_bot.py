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

import html
import logging
import os
import re
import time
from dataclasses import dataclass, field
from typing import Any, Optional

import httpx

logger = logging.getLogger(__name__)

SITE = "https://www.sortirovka24.kz"
HISTORY_TURNS = 12
HISTORY_TTL = 24 * 3600
MUTE_AFTER_OWNER = 12 * 3600
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


_chats: dict[str, Chat] = {}
_seen_ids: dict[str, float] = {}


def enabled() -> bool:
    return os.getenv("SUPPORT_BOT_ENABLED", "1").strip().lower() not in {"0", "false", "no", "off"}


def hook_key() -> str:
    return (os.getenv("SUPPORT_BOT_HOOK_KEY") or os.getenv("WAHA_API_KEY") or "").strip()


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


def system_prompt(modules: dict[str, bool]) -> str:
    on = [MODULE_INFO[k] for k, v in modules.items() if v and k in MODULE_INFO]
    sections = "\n".join(f"- {t}: {u} — {d}" for t, u, d in on) or "- (разделы уточняются)"
    return f"""Ты — помощник поддержки портала «Сортировка 24» (sortirovka24.kz) в WhatsApp. Портал района Сортировка в Караганде.
Отвечай на языке собеседника (русский или казахский), коротко, тепло и по-доброму.
Оформление (это WhatsApp): короткие абзацы с пустой строкой между ними, не сплошным текстом; списки — каждый пункт с новой строки со своим эмодзи; жирный — одной звёздочкой: *так* (не **, не #); 1–3 уместных эмодзи.

Сейчас на портале работают разделы:
{sections}

Как всё устроено:
- Вход и регистрация на сайте — только по номеру телефона, код приходит в WhatsApp (с этого номера) или в Telegram. Пароль не нужен. За регистрацию — 300 бонусов, тратятся в DÄM ALEM (1 бонус = 1 ₸ скидки).
- Личный кабинет: {SITE}/cabinet — история заказов, бонусы, уведомления, адреса, удаление аккаунта (подтверждается кодом).
- Приложение: открыть сайт в Chrome (Android) и нажать «Установить»; на iPhone — «Поделиться» → «На экран Домой».
- Заказать еду: {SITE}/food. Статус заказа виден в кабинете, там же кнопка «Отследить».
- Оплата в DÄM ALEM: наличными при получении или Kaspi/Halyk. При Kaspi/Halyk клиент указывает номер, оператор выставляет счёт в приложение банка (обычно 1–3 минуты), клиент оплачивает уведомление «Оплатить». Готовить начинают после оплаты. Если счёт долго не приходит — передай оператору.
- Стать партнёром (кафе, магазин, услуги): заявка на {SITE}/business — с вами свяжутся.
- Политика конфиденциальности: {SITE}/legal/privacy. Почта поддержки: srt-group.24@mail.ru.
- Такси на портале пока не работает.

Правила:
- Отвечай только про портал «Сортировка 24» и его разделы. На посторонние темы вежливо скажи, что помогаешь только по порталу.
- Никогда не выдумывай цены, время работы, сроки доставки, наличие блюд, статусы конкретных заказов и личные данные — ты их не видишь. В таких случаях дай ссылку или передай оператору.
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
    return ("Спасибо! Передал ваш вопрос оператору — он ответит здесь же в ближайшее время.\n"
            f"Пока можно заглянуть на {SITE}"), True


async def ask_ai(client: httpx.AsyncClient, chat: Chat, modules: dict[str, bool]) -> Optional[str]:
    key = (os.getenv("ANTHROPIC_API_KEY") or "").strip()
    if not key:
        return None
    resp = await client.post(
        "https://api.anthropic.com/v1/messages",
        headers={"x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
        json={"model": os.getenv("SUPPORT_BOT_MODEL", "claude-haiku-5-5"), "max_tokens": 600,
              "system": system_prompt(modules), "messages": chat.turns[-HISTORY_TURNS:]},
        timeout=40,
    )
    resp.raise_for_status()
    return "".join(p.get("text", "") for p in resp.json().get("content", []) if p.get("type") == "text").strip()


# ── WAHA I/O ────────────────────────────────────────────────────────────────

def _waha() -> tuple[str, dict[str, str]]:
    return (os.getenv("WAHA_URL", "http://waha:3000").rstrip("/"),
            {"X-Api-Key": os.getenv("WAHA_API_KEY", "").strip()})


async def send_text(client: httpx.AsyncClient, chat_id: str, text: str) -> None:
    base, headers = _waha()
    session = os.getenv("WAHA_SESSION", "default")
    try:  # look human: mark read and "typing…" briefly
        await client.post(f"{base}/api/sendSeen", headers=headers, json={"session": session, "chatId": chat_id}, timeout=10)
    except httpx.HTTPError:
        pass
    r = await client.post(f"{base}/api/sendText", headers=headers,
                          json={"session": session, "chatId": chat_id, "text": text[:MAX_REPLY_CHARS]}, timeout=20)
    r.raise_for_status()


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


async def notify_owner(client: httpx.AsyncClient, chat_id: str, chat: Chat, last: str) -> None:
    """Tell the owner in Telegram that a person needs a human."""
    from services.news_agent import approval_chat, bot_token, tg
    if not bot_token() or not approval_chat():
        return
    who = html.escape(chat.name or "Клиент")
    number = chat_id.split("@")[0]
    phone = f"+{number}" if chat_id.endswith("@c.us") and number.isdigit() else "номер скрыт WhatsApp"
    history = "\n".join(f"{'👤' if t['role'] == 'user' else '🤖'} {html.escape(t['content'][:300])}" for t in chat.turns[-6:])
    text = (f"💬 <b>WhatsApp «Сортировка 24»: нужен оператор</b>\n\n<b>{who}</b> · {phone}\n\n{history}\n\n"
            "Ответьте человеку в WhatsApp с телефона +7 700 428 02 80 — бот в этом чате замолчит на 12 часов.")
    try:
        await tg(client, "sendMessage", {"chat_id": approval_chat(), "text": text[:4000], "parse_mode": "HTML"})
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


@dataclass
class Outcome:
    action: str  # ignored | muted | replied | handed_off | limited
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
    chat = _chat(chat_id)
    now = time.time()
    if p.get("fromMe"):
        body = str(p.get("body") or "").strip()
        if body.startswith(("Ваш код для входа", "🔔 Сортировка 24")) or body in chat.sent:
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
    elif p.get("hasMedia") and not text:
        text = "(прислал фото или файл без подписи)"
    if not text:
        return Outcome("ignored")
    chat.turns.append({"role": "user", "content": text[:2000]})

    reply: Optional[str] = None
    handoff = False
    try:
        reply = await ask_ai(client, chat, modules if modules is not None else await _modules())
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
