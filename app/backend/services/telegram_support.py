"""Support assistant in the site's Telegram bot: answers people in private chats
the way the WhatsApp support bot does.

The bot loop (news_agent.handle_update) gives us a private message only after
every other handler (login, couriers, operators, shops, the owner's news) has
passed on it. The reply runs in a background task, so login codes and button
taps stay instant while the AI thinks.

Same brain as the WhatsApp bot (support_bot: prompt, directory, DÄM ALEM menu,
fallback, handoff tag), plus voice notes (Whisper) and photos. On a handoff the
owner gets a note in his Telegram chat with the person's name and a link; the
bot then stays silent in that chat for TELEGRAM_SUPPORT_SILENCE_HOURS. The
owner's reply to that note is sent to the person by the bot.

The bot never writes first. Like the WhatsApp bot, state lives in memory.
"""

from __future__ import annotations

import asyncio
import base64
import html
import logging
import os
import re
import time
from typing import Any, Optional

import httpx

from services import support_bot as wa
from services.support_bot import HANDOFF_TAG, Chat, Outcome, fallback_reply

logger = logging.getLogger(__name__)

NEWS_TAG = "[НОВОСТЬ]"
# The bot waits a little so a burst of messages gets one answer.
REPLY_GRACE_SECONDS = float(os.getenv("TELEGRAM_SUPPORT_GRACE", "3"))
MAX_REPLY_CHARS = 3500
MAX_AUDIO_BYTES = 15 * 1024 * 1024
MEDIA_KEYS = ("voice", "audio", "photo", "document", "sticker", "video", "video_note", "animation")

TELEGRAM_NOTE = f"""

Сейчас ты отвечаешь не в WhatsApp, а в Telegram-боте «Сортировка 24» (этот же бот присылает коды для входа на сайт). Оформление — как написано выше.
- Код для входа на сайт можно получить здесь же: на сайте ввести номер и выбрать «Telegram», затем в этом боте отправить /code и нажать «📱 Поделиться номером».
- Если передаёшь вопрос оператору — он ответит здесь же, в этом чате.
- Жители могут предложить свою новость: пусть пришлют сюда текст (первая строка — заголовок) и, если есть, фото с подписью. Когда человек прислал саму новость (а не просто спросил, как это сделать), поблагодари, скажи, что передал редакции и новость выйдет после проверки, и добавь в самом конце ответа метку {NEWS_TAG}.
- Заказы DÄM ALEM здесь не принимаются: дай ссылку на WhatsApp DÄM ALEM."""

_chats: dict[str, Chat] = {}
_seen: dict[str, float] = {}
_global_recent: list[float] = []
_notices: dict[int, str] = {}  # message id in the owner's chat → the person's chat id
_tasks: set[asyncio.Task] = set()


def _int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, "") or default)
    except ValueError:
        return default


def enabled() -> bool:
    flag = (os.getenv("TELEGRAM_SUPPORT_BOT") or "").strip().lower()
    if flag:
        return flag not in {"0", "false", "no", "off"}
    return bool((os.getenv("ANTHROPIC_API_KEY") or "").strip())


def silence_seconds() -> float:
    try:
        return float(os.getenv("TELEGRAM_SUPPORT_SILENCE_HOURS", "") or 6) * 3600
    except ValueError:
        return 6 * 3600


def _owner_ids() -> set[str]:
    from services.news_agent import admin_ids, approval_chat
    return {x for x in admin_ids() | {approval_chat()} if x}


def _chat(chat_id: str) -> Chat:
    now = time.time()
    chat = _chats.setdefault(chat_id, Chat())
    if now - chat.updated > wa.HISTORY_TTL:
        chat.turns = []
    chat.updated = now
    return chat


def _duplicate(key: str) -> bool:
    now = time.time()
    for k in [k for k, t in _seen.items() if now - t > 3600]:
        _seen.pop(k, None)
    if key in _seen:
        return True
    _seen[key] = now
    return False


def _limited(chat: Chat, now: float) -> bool:
    chat.recent = [t for t in chat.recent if now - t < 3600]
    _global_recent[:] = [t for t in _global_recent if now - t < 3600]
    if len(chat.recent) >= _int("TELEGRAM_SUPPORT_PER_HOUR", 20) or \
            len(_global_recent) >= _int("TELEGRAM_SUPPORT_GLOBAL_PER_HOUR", 300):
        return True
    chat.recent.append(now)
    _global_recent.append(now)
    return False


def _remember_notice(message_id: Any, chat_id: str) -> None:
    if isinstance(message_id, int):
        _notices[message_id] = chat_id
        for key in sorted(_notices)[:-500]:
            _notices.pop(key, None)


def _name(user: dict[str, Any]) -> str:
    return " ".join(x for x in (user.get("first_name"), user.get("last_name")) if x) or user.get("username") or ""


def to_html(text: str) -> str:
    """The AI writes WhatsApp style (*bold*); Telegram gets the same as HTML."""
    return re.sub(r"\*([^*\n]+)\*", r"<b>\1</b>", html.escape(text))


# ── entry from the bot loop ─────────────────────────────────────────────────

async def handle_message(db, client: httpx.AsyncClient, message: dict[str, Any]) -> bool:
    """True when the message is ours: the owner's reply to a handoff note, or a person's private message."""
    if not enabled():
        return False
    if await relay_owner_reply(client, message):
        return True
    chat = message.get("chat") or {}
    sender = message.get("from") or {}
    said = str(message.get("text") or "").strip()
    if chat.get("type") != "private" or sender.get("is_bot") or str(sender.get("id", "")) in _owner_ids():
        return False
    if said.startswith("/") or not (said or message.get("caption") or any(message.get(k) for k in MEDIA_KEYS)):
        return False  # commands belong to the other flows
    if await _is_staff(db, chat.get("id")):
        return False
    if _duplicate(f"{chat.get('id')}:{message.get('message_id')}"):
        return True
    task = asyncio.create_task(_respond_safely(client, message))
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)
    return True


async def _is_staff(db, chat_id: Any) -> bool:
    """Linked operator and courier chats are work chats: the assistant stays out of them."""
    from services import courier_telegram, operator_telegram
    try:
        return str(chat_id) in await operator_telegram.chats(db) or bool(await courier_telegram.courier_for_chat(db, chat_id))
    except Exception as exc:
        await db.rollback()
        logger.warning("[TgSupport] staff check failed: %s", exc)
        return True


async def _respond_safely(client: httpx.AsyncClient, message: dict[str, Any]) -> None:
    try:
        await respond(client, message)
    except Exception as exc:
        logger.warning("[TgSupport] reply failed: %s", exc)


async def respond(client: httpx.AsyncClient, message: dict[str, Any]) -> Outcome:
    chat_id = str((message.get("chat") or {}).get("id", ""))
    sender = message.get("from") or {}
    chat = _chat(chat_id)
    chat.name = _name(sender) or chat.name
    text = str(message.get("text") or message.get("caption") or "").strip()
    now = time.time()
    if _limited(chat, now):
        return Outcome("limited")
    if now < chat.muted_until:
        # A human has this chat: keep the history and show the owner what the person adds.
        if text:
            chat.turns.append({"role": "user", "content": text[:2000]})
        await _forward_to_owner(client, chat_id, message)
        return Outcome("muted")

    voice = message.get("voice") or message.get("audio")
    if isinstance(voice, dict):
        heard = None
        try:
            heard = await transcribe(client, voice)
        except Exception as exc:
            logger.warning("[TgSupport] transcribe failed: %s", exc)
        if not heard:
            reply = "Пока не получилось прослушать голосовое 🙏 Напишите, пожалуйста, вопрос текстом."
            await send(client, chat_id, reply)
            return Outcome("replied", reply)
        text = f"{heard} {text}".strip()
    image = None
    if not voice:
        try:
            image = await fetch_photo(client, message)
        except Exception as exc:
            logger.warning("[TgSupport] photo download failed: %s", exc)
        if image:
            text = f"[прислал фото] {text}".strip()
        elif not text:
            text = "(прислал файл без подписи)"
    chat.turns.append({"role": "user", "content": text[:2000]})
    arrived = chat.last_user_at = time.time()
    if REPLY_GRACE_SECONDS > 0:
        await asyncio.sleep(REPLY_GRACE_SECONDS)
        if chat.last_user_at != arrived:
            return Outcome("ignored")  # a newer message came in; that one gets the answer

    from services.news_agent import tg
    try:
        await tg(client, "sendChatAction", {"chat_id": chat_id, "action": "typing"})
    except Exception:
        pass
    reply: Optional[str] = None
    handoff = False
    try:
        reply = await ask_ai(client, chat, image)
    except Exception as exc:
        logger.warning("[TgSupport] AI failed: %s", exc)
    if reply is None:
        reply, handoff = fallback_reply(text)
    handoff = handoff or HANDOFF_TAG in reply
    news = NEWS_TAG in reply
    reply = reply.replace(HANDOFF_TAG, "").replace(NEWS_TAG, "").strip() or \
        "Передал ваш вопрос оператору — он скоро ответит здесь."
    chat.turns.append({"role": "assistant", "content": reply})
    await send(client, chat_id, reply)
    if handoff:
        chat.handed_off_at = now
        chat.muted_until = now + silence_seconds()
        await notify_owner(client, chat_id, chat, sender, "💬 <b>Telegram-бот «Сортировка 24»: нужен оператор</b>")
    elif news:
        await notify_owner(client, chat_id, chat, sender, "📰 <b>Новость от жителя через Telegram-бот</b>")
        await _forward_to_owner(client, chat_id, message)
    return Outcome("handed_off" if handoff else "replied", reply)


# ── AI and media adapters ───────────────────────────────────────────────────

async def ask_ai(client: httpx.AsyncClient, chat: Chat, image: Optional[tuple[str, str]] = None) -> Optional[str]:
    """support_bot's brain with a Telegram note added to its prompt."""
    key = (os.getenv("ANTHROPIC_API_KEY") or "").strip()
    if not key:
        return None
    messages = [dict(t) for t in chat.turns[-wa.HISTORY_TURNS:]]
    while messages and messages[0]["role"] != "user":
        messages.pop(0)
    if image and messages and messages[-1]["role"] == "user":
        messages[-1]["content"] = [{"type": "image", "source": {"type": "base64", "media_type": image[0], "data": image[1]}},
                                   {"type": "text", "text": messages[-1]["content"]}]
    system = wa.system_prompt(await wa._modules(), await wa._directory(), await wa._menu()) + TELEGRAM_NOTE
    resp = await client.post(
        "https://api.anthropic.com/v1/messages",
        headers={"x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
        json={"model": os.getenv("SUPPORT_BOT_MODEL", "claude-haiku-5-5"), "max_tokens": 900,
              "system": system, "messages": messages},
        timeout=40,
    )
    resp.raise_for_status()
    return "".join(p.get("text", "") for p in resp.json().get("content", []) if p.get("type") == "text").strip()


async def download(client: httpx.AsyncClient, file: dict[str, Any], limit: int) -> Optional[bytes]:
    """A Telegram file by its file_id; None when it is bigger than `limit`."""
    from services.news_agent import bot_token, tg
    if not file.get("file_id") or (file.get("file_size") or 0) > limit:
        return None
    info = await tg(client, "getFile", {"file_id": file["file_id"]})
    resp = await client.get(f"https://api.telegram.org/file/bot{bot_token()}/{info['result']['file_path']}", timeout=60)
    resp.raise_for_status()
    return resp.content if resp.content and len(resp.content) <= limit else None


async def transcribe(client: httpx.AsyncClient, voice: dict[str, Any]) -> Optional[str]:
    """Voice note → text through the same Whisper server the WhatsApp bot uses."""
    whisper = (os.getenv("WHISPER_URL") or "").rstrip("/")
    if not whisper:
        return None
    audio = await download(client, voice, MAX_AUDIO_BYTES)
    if not audio:
        return None
    r = await client.post(f"{whisper}/asr", params={"task": "transcribe", "output": "txt", "encode": "true"},
                          files={"audio_file": ("voice.ogg", audio, voice.get("mime_type") or "audio/ogg")},
                          timeout=120)
    r.raise_for_status()
    return r.text.strip() or None


async def fetch_photo(client: httpx.AsyncClient, message: dict[str, Any]) -> Optional[tuple[str, str]]:
    """A photo (or an image sent as a file) → (media_type, base64) for the AI; None when absent or too big."""
    sizes = [p for p in message.get("photo") or [] if (p.get("file_size") or 0) <= wa.MAX_IMAGE_BYTES]
    if sizes:
        file, kind = max(sizes, key=lambda p: p.get("file_size") or p.get("width", 0)), "image/jpeg"
    else:
        file = message.get("document") or {}
        kind = str(file.get("mime_type") or "").lower()
        if kind not in wa.IMAGE_TYPES:
            return None
    data = await download(client, file, wa.MAX_IMAGE_BYTES)
    return (kind, base64.b64encode(data).decode()) if data else None


# ── talking to the person and the owner ─────────────────────────────────────

async def send(client: httpx.AsyncClient, chat_id: str, text: str) -> None:
    from services.news_agent import tg
    await tg(client, "sendMessage", {"chat_id": chat_id, "text": to_html(text[:MAX_REPLY_CHARS]), "parse_mode": "HTML"})


async def notify_owner(client: httpx.AsyncClient, chat_id: str, chat: Chat, user: dict[str, Any], title: str) -> None:
    """A note in the owner's chat; his reply to it goes to the person."""
    from services.news_agent import approval_chat, bot_token, tg
    if not bot_token() or not approval_chat():
        return
    e = html.escape
    who = [f"<b>{e(chat.name or 'Без имени')}</b>"]
    if user.get("username"):
        who.append(f"@{e(user['username'])}")
    who.append(f"<a href=\"tg://user?id={e(str(user.get('id', chat_id)))}\">открыть чат</a>")
    history = "\n".join(f"{'👤' if t['role'] == 'user' else '🤖'} {e(t['content'][:300])}" for t in chat.turns[-6:])
    hours = silence_seconds() / 3600
    tail = (f"Ответьте на это сообщение (свайп → «Ответить») — бот перешлёт ответ человеку. "
            f"Бот в этом чате молчит {hours:g} ч." if chat.muted_until > time.time()
            else "Ответьте на это сообщение — бот перешлёт ответ человеку.")
    text = f"{title}\n\n{' · '.join(who)}\n\n{history}\n\n{tail}"
    try:
        data = await tg(client, "sendMessage", {"chat_id": approval_chat(), "text": text[:4000], "parse_mode": "HTML"})
        _remember_notice((data.get("result") or {}).get("message_id"), chat_id)
    except Exception as exc:
        logger.warning("[TgSupport] owner notify failed: %s", exc)


async def _forward_to_owner(client: httpx.AsyncClient, chat_id: str, message: dict[str, Any]) -> None:
    from services.news_agent import approval_chat, tg
    if not approval_chat():
        return
    try:
        data = await tg(client, "forwardMessage", {"chat_id": approval_chat(), "from_chat_id": chat_id,
                                                   "message_id": message.get("message_id")})
        _remember_notice((data.get("result") or {}).get("message_id"), chat_id)
    except Exception as exc:
        logger.info("[TgSupport] forward to owner failed: %s", exc)


async def relay_owner_reply(client: httpx.AsyncClient, message: dict[str, Any]) -> bool:
    """The owner replied to a handoff note (or a forwarded message) → the bot sends his answer to the person."""
    from services.news_agent import approval_chat, tg
    chat_id = str((message.get("chat") or {}).get("id", ""))
    target = _notices.get((message.get("reply_to_message") or {}).get("message_id"))
    if not target or chat_id != approval_chat() or str((message.get("from") or {}).get("id", "")) not in _owner_ids():
        return False
    try:
        await tg(client, "copyMessage", {"chat_id": target, "from_chat_id": chat_id, "message_id": message.get("message_id")})
        answer = "✅ Отправлено"
    except Exception as exc:
        answer = f"Не получилось отправить: {exc}"[:300]
    else:
        chat = _chat(target)
        chat.muted_until = time.time() + silence_seconds()  # the human carries on in this chat
        said = str(message.get("text") or message.get("caption") or "").strip()
        if said:
            chat.turns.append({"role": "assistant", "content": said})
    await tg(client, "sendMessage", {"chat_id": chat_id, "text": answer, "reply_to_message_id": message.get("message_id")})
    return True
