"""Posters («Афиша») from partner organisations, sent through the site's Telegram bot and approved by the owner.

1. The owner makes a one-time link for an organisation (kit: poster-link): «t.me/<bot>?start=pp_<code>».
2. Someone from the organisation opens it once; that private chat becomes the organisation's poster chat.
3. They send the poster picture with a caption (first line — the title, then date, time, price, phone).
   It becomes a *draft* news item in the «Афиша» section and the owner gets the usual approval card
   («Опубликовать» / «Отклонить»), exactly like the owner's own news.
4. The owner's tap publishes or deletes the draft; the organisation is told which (services.news_agent calls
   `after_decision`).

Nothing is published without the owner's tap, and only linked chats can send posters.
"""
from __future__ import annotations

import html
import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from sqlalchemy import text

logger = logging.getLogger(__name__)

START_PREFIX = "pp_"
CODE_DAYS = 7
CATEGORY = "Афиша"
MIN_TEXT = 20
_ready: set[int] = set()

HELP = ("Как прислать афишу:\n"
        "1) прикрепите картинку афиши;\n"
        "2) в подписи к ней напишите: первая строка — название, дальше — дата, время, место, цена, телефон.\n\n"
        "После проверки афиша появится на sortirovka24.kz в разделе «Новости → Афиша» и в нашем Telegram-канале. "
        "Это бесплатно.")


def now() -> datetime:
    return datetime.now(timezone.utc)


async def ensure_tables(db) -> None:
    key = id(getattr(db, "bind", None))
    if key in _ready:
        return
    await db.execute(text("CREATE TABLE IF NOT EXISTS poster_invites (code VARCHAR(48) PRIMARY KEY, org VARCHAR(160) NOT NULL, "
                          "expires_at VARCHAR(32) NOT NULL, chat_id VARCHAR(32))"))
    await db.execute(text("CREATE TABLE IF NOT EXISTS poster_partners (chat_id VARCHAR(32) PRIMARY KEY, org VARCHAR(160) NOT NULL, "
                          "linked_at VARCHAR(32) NOT NULL)"))
    await db.execute(text("CREATE TABLE IF NOT EXISTS poster_posts (news_id INTEGER PRIMARY KEY, chat_id VARCHAR(32) NOT NULL, "
                          "title VARCHAR(200), created_at VARCHAR(32) NOT NULL)"))
    await db.commit()
    _ready.add(key)


async def new_link(db, org: str) -> Optional[str]:
    from services.courier_telegram import bot_username
    org = " ".join(str(org or "").split())[:160]
    bot = await bot_username()
    if not bot or not org:
        return None
    await ensure_tables(db)
    code = secrets.token_urlsafe(12)
    await db.execute(text("INSERT INTO poster_invites (code, org, expires_at) VALUES (:c, :o, :e)"),
                     {"c": code, "o": org, "e": (now() + timedelta(days=CODE_DAYS)).isoformat()})
    await db.commit()
    return f"https://t.me/{bot}?start={START_PREFIX}{code}"


async def partner_of(db, chat_id: Any) -> Optional[str]:
    await ensure_tables(db)
    return await db.scalar(text("SELECT org FROM poster_partners WHERE chat_id = :c"), {"c": str(chat_id)})


async def _say(client, chat_id: Any, words: str, reply_to: Any = None) -> None:
    from services.news_agent import tg
    await tg(client, "sendMessage", {"chat_id": chat_id, "text": words, "disable_web_page_preview": True,
                                     **({"reply_to_message_id": reply_to} if reply_to else {})})


async def handle_message(db, client, message: dict[str, Any]) -> bool:
    """Link a chat with /start pp_<code>; turn a linked chat's poster into a draft. True when the message was ours."""
    chat = message.get("chat") or {}
    if chat.get("type") != "private":
        return False
    words = str(message.get("text") or "").strip().split()
    if len(words) == 2 and words[0] == "/start" and words[1].startswith(START_PREFIX):
        await ensure_tables(db)
        code = words[1][len(START_PREFIX):]
        row = (await db.execute(text("SELECT org, expires_at, chat_id FROM poster_invites WHERE code = :c"), {"c": code})).first()
        if not row or row.expires_at < now().isoformat() or (row.chat_id and row.chat_id != str(chat.get("id"))):
            await _say(client, chat.get("id"), "Ссылка устарела. Попросите у «Сортировка 24» новую ссылку для афиш.")
            return True
        await db.execute(text("DELETE FROM poster_partners WHERE chat_id = :c"), {"c": str(chat.get("id"))})
        await db.execute(text("INSERT INTO poster_partners (chat_id, org, linked_at) VALUES (:c, :o, :t)"),
                         {"c": str(chat.get("id")), "o": row.org, "t": now().isoformat()})
        await db.execute(text("UPDATE poster_invites SET chat_id = :ch WHERE code = :c"), {"ch": str(chat.get("id")), "c": code})
        await db.commit()
        await _say(client, chat.get("id"), f"✅ Готово: этот чат подключён для афиш «{row.org}».\n\n{HELP}")
        return True
    org = await partner_of(db, chat.get("id"))
    if not org:
        return False
    if words[:1] in (["/start"], ["/help"]):
        await _say(client, chat.get("id"), f"Афиши «{org}».\n\n{HELP}")
        return True
    caption = str(message.get("caption") or message.get("text") or "").strip()
    if message.get("media_group_id") and not caption:
        return True  # the other pictures of an album: the one with the caption carries the poster
    if not message.get("photo"):
        await _say(client, chat.get("id"), "Пришлите, пожалуйста, картинку афиши, а текст напишите в подписи к ней.\n\n" + HELP,
                   message.get("message_id"))
        return True
    if len(caption) < MIN_TEXT:
        await _say(client, chat.get("id"), "Добавьте к картинке подпись: название, дата, время, место, цена.", message.get("message_id"))
        return True
    try:
        title = await submit(db, client, chat.get("id"), org, caption, message["photo"], message.get("message_id"))
    except Exception as exc:
        await db.rollback()
        logger.warning("[Posters] submit failed: %s", exc)
        await _say(client, chat.get("id"), "Не получилось принять афишу, попробуйте ещё раз через минуту.", message.get("message_id"))
        return True
    await _say(client, chat.get("id"), f"📨 Афиша «{title}» получена. После проверки она появится на сайте — мы сообщим.",
               message.get("message_id"))
    return True


async def submit(db, client, chat_id: Any, org: str, caption: str, photos: list[dict[str, Any]], message_id: Any) -> str:
    from models.news import News
    from services import news_agent as na
    title, body = na.split_own_post(caption)
    image = await na.upload_telegram_photo(client, photos)
    lead, rest = na.split_lead(body)
    news = News(title=title[:160], short_description=lead, content=(rest + f"\n\nОрганизатор: {org}").strip(),
                category=CATEGORY, image_url=image, published=False, status=na.PENDING, created_at=na._now_iso())
    db.add(news)
    await db.flush()
    await db.execute(text("INSERT INTO poster_posts (news_id, chat_id, title, created_at) VALUES (:n, :c, :t, :a)"),
                     {"n": news.id, "c": str(chat_id), "t": news.title, "a": now().isoformat()})
    await db.commit()
    card = await na.send_approval(client, db, news, f"Афиша от «{org}»", "")
    await na.remember_message(db, card, news.id)
    return news.title


async def after_decision(db, client, news_id: int, published: bool) -> None:
    """Tell the organisation what happened to its poster. Silent for news that did not come from a partner."""
    try:
        await ensure_tables(db)
        row = (await db.execute(text("SELECT chat_id, title FROM poster_posts WHERE news_id = :n"), {"n": news_id})).first()
        if not row:
            return
        from services.news_agent import SITE
        await db.execute(text("DELETE FROM poster_posts WHERE news_id = :n"), {"n": news_id})
        await db.commit()
        title = html.unescape(row.title or "")
        await _say(client, row.chat_id, f"✅ Афиша «{title}» опубликована: {SITE}/news/{news_id}" if published
                   else f"Афиша «{title}» не опубликована. Если нужно, свяжитесь с «Сортировка 24».")
    except Exception as exc:
        await db.rollback()
        logger.warning("[Posters] could not notify the partner: %s", exc)
