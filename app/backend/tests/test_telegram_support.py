"""Telegram support assistant: answers private chats, hears voice, sees photos, hands off and stays silent,
never answers groups, and leaves every older bot flow (login, /start code, owner's news) as it was."""
import asyncio
import json

import httpx
import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from core.database import Base
from models.module_settings import ModuleSettings
from models.news import News
from services import news_agent, support_bot, telegram_support

MODULES = {"food": True, "news": True, "directory": True}
MENU = [{"category": "Пиццы", "name": "Пепперони", "price": "3 200"}]


@pytest.fixture(autouse=True)
def clean(monkeypatch):
    for store in (telegram_support._chats, telegram_support._seen, telegram_support._notices):
        store.clear()
    telegram_support._global_recent.clear()
    monkeypatch.setattr(telegram_support, "REPLY_GRACE_SECONDS", 0)

    async def modules():
        return MODULES
    monkeypatch.setattr(support_bot, "_modules", modules)
    monkeypatch.setattr(support_bot, "_directory_cache", (float("inf"), []))
    monkeypatch.setattr(support_bot, "_menu_cache", (float("inf"), MENU))
    monkeypatch.setenv("NEWS_TELEGRAM_BOT_TOKEN", "1:t")
    monkeypatch.setenv("NEWS_TELEGRAM_CHAT_ID", "555")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "x")
    monkeypatch.setenv("WHISPER_URL", "http://whisper:9000")
    for name in ("NEWS_TELEGRAM_ADMIN_IDS", "TELEGRAM_SUPPORT_BOT", "TELEGRAM_SUPPORT_PER_HOUR", "TELEGRAM_LOGIN_BOT"):
        monkeypatch.delenv(name, raising=False)


@pytest.fixture
async def maker():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all, tables=[News.__table__, ModuleSettings.__table__])
    yield async_sessionmaker(engine, expire_on_commit=False)
    await engine.dispose()


class Fake:
    """Telegram, Anthropic and Whisper in one mock transport."""

    def __init__(self, ai_text="Здравствуйте! Меню DÄM ALEM: https://www.sortirovka24.kz/food"):
        self.ai_text, self.log, self.next_id = ai_text, [], 100

    def __call__(self, request):
        url = str(request.url)
        is_json = request.headers.get("content-type", "").startswith("application/json")
        body = json.loads(request.content) if is_json and request.content else {}
        self.log.append((url, body))
        if "anthropic" in url:
            return httpx.Response(200, json={"content": [{"type": "text", "text": self.ai_text}]})
        if "whisper" in url:
            return httpx.Response(200, text="как заказать пиццу")
        if "/file/bot" in url:
            return httpx.Response(200, content=b"\xff\xd8media")
        if url.endswith("/getFile"):
            return httpx.Response(200, json={"ok": True, "result": {"file_path": "f/1"}})
        self.next_id += 1
        return httpx.Response(200, json={"ok": True, "result": {"message_id": self.next_id}})

    def calls(self, part):
        return [b for u, b in self.log if u.endswith(part) or part in u]


def private(text=None, *, user=42, mid=1, **extra):
    message = {"message_id": mid, "chat": {"id": user, "type": "private"},
               "from": {"id": user, "first_name": "Асия", "username": "asiya"}, **extra}
    if text is not None:
        message["text"] = text
    return {"update_id": mid, "message": message}


async def run(maker, fake, *updates):
    async with httpx.AsyncClient(transport=httpx.MockTransport(fake)) as client:
        async with maker() as db:
            for update in updates:
                await news_agent.handle_update(db, client, update)
        await asyncio.gather(*list(telegram_support._tasks))


async def test_text_is_answered_with_menu_and_dam_alem_link(maker):
    fake = Fake()
    await run(maker, fake, private("Что у вас есть в меню?"))
    ai = fake.calls("anthropic")[0]
    assert "Telegram" in ai["system"] and "Пепперони" in ai["system"] and "wa.me/77470304096" in ai["system"]
    assert ai["messages"] == [{"role": "user", "content": "Что у вас есть в меню?"}]
    reply = fake.calls("/sendMessage")[-1]
    assert reply["chat_id"] == "42" and "/food" in reply["text"] and reply["parse_mode"] == "HTML"
    assert not [b for b in fake.calls("/sendMessage") if b["chat_id"] == "555"]  # no owner noise


async def test_history_is_kept_per_chat(maker):
    fake = Fake()
    await run(maker, fake, private("Привет", mid=1), private("А бонусы?", mid=2))
    assert [t["content"] for t in fake.calls("anthropic")[-1]["messages"]][::2] == ["Привет", "А бонусы?"]


async def test_voice_is_transcribed(maker):
    fake = Fake()
    await run(maker, fake, private(voice={"file_id": "v1", "file_size": 2000, "mime_type": "audio/ogg"}))
    assert any("whisper" in u for u, _ in fake.log)
    assert fake.calls("anthropic")[0]["messages"][-1]["content"] == "как заказать пиццу"


async def test_photo_goes_to_the_ai(maker):
    fake = Fake()
    photo = [{"file_id": "small", "file_size": 100, "width": 90},
             {"file_id": "big", "file_size": 9 * 1024 * 1024, "width": 2000},
             {"file_id": "mid", "file_size": 4000, "width": 800}]
    await run(maker, fake, private(photo=photo, caption="ошибка на сайте"))
    assert fake.calls("/getFile")[0]["file_id"] == "mid"  # the largest one under 5 MB
    content = fake.calls("anthropic")[0]["messages"][-1]["content"]
    assert content[0]["type"] == "image" and content[0]["source"]["media_type"] == "image/jpeg"
    assert content[1]["text"] == "[прислал фото] ошибка на сайте"


async def test_handoff_notifies_owner_then_silence_and_owner_reply_is_relayed(maker):
    fake = Fake(ai_text="Передал вопрос оператору, он скоро напишет здесь. [ОПЕРАТОР]")
    await run(maker, fake, private("Позовите человека", mid=1))
    to_user, note = fake.calls("/sendMessage")[-2:]
    assert "[ОПЕРАТОР]" not in to_user["text"]
    assert note["chat_id"] == "555" and "@asiya" in note["text"] and "tg://user?id=42" in note["text"]
    note_id = fake.next_id

    asked = len(fake.calls("anthropic"))
    await run(maker, fake, private("Алло?", mid=2))
    assert len(fake.calls("anthropic")) == asked  # silent
    assert fake.calls("/forwardMessage")[-1] == {"chat_id": "555", "from_chat_id": "42", "message_id": 2}

    owner_reply = {"update_id": 3, "message": {"message_id": 50, "chat": {"id": 555, "type": "private"},
                                               "from": {"id": 555}, "text": "Здравствуйте, это Алибек",
                                               "reply_to_message": {"message_id": note_id}}}
    await run(maker, fake, owner_reply)
    assert fake.calls("/copyMessage")[-1] == {"chat_id": "42", "from_chat_id": "555", "message_id": 50}
    assert fake.calls("/sendMessage")[-1]["text"] == "✅ Отправлено"


async def test_news_from_resident_reaches_owner_without_silence(maker):
    fake = Fake(ai_text="Спасибо! Передал редакции. [НОВОСТЬ]")
    await run(maker, fake, private("На Защитной прорвало трубу\nВода течёт с утра", mid=7))
    assert "[НОВОСТЬ]" not in fake.calls("/sendMessage")[0]["text"]
    note = fake.calls("/sendMessage")[-1]["text"]
    assert "Новость от жителя" in note and "прорвало трубу" in note
    assert not fake.calls("/forwardMessage")  # the text is in the note already: no second copy
    assert telegram_support._chats["42"].muted_until == 0
    await run(maker, fake, private(mid=8, photo=[{"file_id": "p", "file_size": 100, "width": 90}], caption="Фото трубы"))
    assert fake.calls("/forwardMessage")[-1]["message_id"] == 8  # a photo is forwarded as is


async def test_groups_bots_and_commands_are_ignored(maker):
    fake = Fake()
    group = {"update_id": 1, "message": {"message_id": 1, "chat": {"id": -100, "type": "supergroup"},
                                         "from": {"id": 42}, "text": "привет"}}
    bot = private("привет", mid=2)
    bot["message"]["from"]["is_bot"] = True
    await run(maker, fake, group, bot, private("/help", mid=3))
    assert not fake.calls("anthropic") and not fake.calls("/sendMessage")


async def test_duplicate_update_answered_once(maker):
    fake = Fake()
    await run(maker, fake, private("Привет", mid=5), private("Привет", mid=5))
    assert len(fake.calls("anthropic")) == 1


async def test_rate_limit_per_user(maker, monkeypatch):
    monkeypatch.setenv("TELEGRAM_SUPPORT_PER_HOUR", "2")
    fake = Fake()
    await run(maker, fake, *(private(f"вопрос {i}", mid=i) for i in range(1, 5)))
    assert len(fake.calls("anthropic")) == 2


async def test_switched_off_by_flag(maker, monkeypatch):
    monkeypatch.setenv("TELEGRAM_SUPPORT_BOT", "0")
    fake = Fake()
    await run(maker, fake, private("Привет"))
    assert not fake.calls("anthropic") and not fake.calls("/sendMessage")


async def test_login_flows_keep_priority(maker):
    fake = Fake()
    contact = private(mid=1, contact={"phone_number": "77001234567", "user_id": 99})
    await run(maker, fake, contact, private("/start code", mid=2), private("/start", mid=3))
    texts = [b["text"] for b in fake.calls("/sendMessage")]
    assert "своим номером" in texts[0]
    assert "Поделиться номером" in texts[1] and len(texts) == 3
    assert "помощник" in texts[2] and "/code" in texts[2]  # plain /start: the helper greets, no login keyboard
    assert not fake.calls("anthropic")


async def test_owner_private_messages_stay_with_the_news_flow(maker):
    fake = Fake()
    owner = {"update_id": 1, "message": {"message_id": 1, "chat": {"id": 555, "type": "private"},
                                         "from": {"id": 555}, "text": "привет"}}
    await run(maker, fake, owner)
    assert not fake.calls("anthropic")


async def test_operator_chat_is_left_alone(maker):
    from sqlalchemy import text
    from services import operator_telegram
    fake = Fake()
    async with maker() as db:
        await operator_telegram.ensure_tables(db)
        await db.execute(text("INSERT INTO operator_telegram (chat_id) VALUES ('42')"))
        await db.commit()
    await run(maker, fake, private("что-то своё"))
    assert not fake.calls("anthropic")
