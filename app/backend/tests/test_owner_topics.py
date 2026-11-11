"""Owner notices sorted into the working group's topics: private chat until a forum group is bound, new topics
appear in an already bound group, a deleted topic is recreated, and buttons, replies and own news keep working
there for the owner and group admins only."""
import json

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from core.database import Base, db_manager
from models.module_settings import ModuleSettings
from models.news import News
from services import news_agent, telegram_support

GROUP = -100555
ADMIN, MEMBER = 777, 888


@pytest.fixture
async def maker(monkeypatch):
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all, tables=[ModuleSettings.__table__, News.__table__])
    monkeypatch.setenv("NEWS_TELEGRAM_BOT_TOKEN", "1:t")
    monkeypatch.setenv("NEWS_TELEGRAM_CHAT_ID", "555")
    for name in ("NEWS_TELEGRAM_ADMIN_IDS", "TELEGRAM_SUPPORT_BOT"):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv("ANTHROPIC_API_KEY", "x")
    monkeypatch.setattr(telegram_support, "REPLY_GRACE_SECONDS", 0)
    telegram_support._notices.clear()
    maker = async_sessionmaker(engine, expire_on_commit=False)
    monkeypatch.setattr(db_manager, "async_session_maker", maker)  # senders open their own session
    yield maker
    await engine.dispose()


class Telegram:
    def __init__(self, forum=True):
        self.log, self.forum, self.next_id, self.dead = [], forum, 100, set()

    def __call__(self, request):
        method = str(request.url).rsplit("/", 1)[-1]
        body = json.loads(request.content or b"{}")
        self.log.append((method, body))
        self.next_id += 1
        if method == "getChat":
            return httpx.Response(200, json={"ok": True, "result": {"id": GROUP, "title": "S24", "is_forum": self.forum}})
        if method == "createForumTopic":
            return httpx.Response(200, json={"ok": True, "result": {"message_thread_id": self.next_id}})
        if method == "getChatMember":
            status = "administrator" if body["user_id"] == ADMIN else "member"
            return httpx.Response(200, json={"ok": True, "result": {"status": status}})
        if body.get("message_thread_id") in self.dead:
            return httpx.Response(400, json={"ok": False, "description": "Bad Request: message thread not found"})
        return httpx.Response(200, json={"ok": True, "result": {"message_id": self.next_id}})

    def calls(self, method):
        return [b for m, b in self.log if m == method]


async def bind_old_group(maker, **extra):
    """What production has: a forum group bound by an older version with two topics."""
    async with maker() as db:
        row, state = await news_agent.load_state(db)
        state["workspace"] = {"id": GROUP, "title": "S24", "type": "supergroup", "forum": True,
                              "topics": {"news": 7, "leads": 8}, **extra}
        news_agent.save_state(row, state)
        await db.commit()


async def test_private_chat_until_a_forum_group_has_the_topic(maker):
    assert await news_agent.owner_target("ads") == {"chat_id": "555"}
    await bind_old_group(maker, forum=False)
    news_agent.reset_owner_cache()
    assert await news_agent.owner_target("news") == {"chat_id": "555"}  # a group without «Темы»
    await bind_old_group(maker)
    news_agent.reset_owner_cache()
    assert await news_agent.owner_target("leads") == {"chat_id": GROUP, "message_thread_id": 8}
    assert await news_agent.owner_target("ads") == {"chat_id": "555"}  # topic not created yet


async def test_new_topics_appear_in_the_bound_group_and_are_announced_once(maker):
    await bind_old_group(maker)
    fake = Telegram()
    async with httpx.AsyncClient(transport=httpx.MockTransport(fake)) as client, maker() as db:
        assert await news_agent.ensure_topics(db, client, refresh=True) is None
        assert await news_agent.ensure_topics(db, client, refresh=True) is None
        _, state = await news_agent.load_state(db)
    topics = state["workspace"]["topics"]
    assert set(topics) == set(news_agent.TOPICS) and topics["news"] == 7 and topics["leads"] == 8
    assert sorted(b["name"] for b in fake.calls("createForumTopic")) == sorted(
        name for kind, (name, _) in news_agent.TOPICS.items() if kind not in ("news", "leads"))
    group_map, note = fake.calls("sendMessage")
    assert group_map["chat_id"] == GROUP and "Сбои" in group_map["text"] and "message_thread_id" not in group_map
    assert fake.calls("pinChatMessage")[0]["chat_id"] == GROUP
    assert note == {"chat_id": "555", "text": "Теперь уведомления приходят в группу «S24» по темам. Список тем — /topics"}
    assert await news_agent.owner_target("alerts") == {"chat_id": GROUP, "message_thread_id": topics["alerts"]}


async def test_topics_switched_off_sends_back_to_private_chat(maker):
    await bind_old_group(maker)
    fake = Telegram(forum=False)
    async with httpx.AsyncClient(transport=httpx.MockTransport(fake)) as client, maker() as db:
        await news_agent.ensure_topics(db, client, refresh=True)
    assert not fake.calls("createForumTopic") and not fake.calls("sendMessage")
    assert await news_agent.owner_target("news") == {"chat_id": "555"}


async def test_without_rights_the_problem_is_reported_and_the_rest_stays_private(maker):
    await bind_old_group(maker)

    def refuse(request):
        if request.url.path.endswith("/createForumTopic"):
            return httpx.Response(400, json={"ok": False, "description": "Bad Request: not enough rights"})
        return Telegram()(request)
    async with httpx.AsyncClient(transport=httpx.MockTransport(refuse)) as client, maker() as db:
        problem = await news_agent.ensure_topics(db, client)
    assert "Управление темами" in problem
    assert await news_agent.owner_target("ads") == {"chat_id": "555"}
    assert await news_agent.owner_target("news") == {"chat_id": GROUP, "message_thread_id": 7}


async def test_deleted_topic_is_recreated_once_then_private_chat(maker):
    await bind_old_group(maker, announced=True)
    fake = Telegram()
    fake.dead.add(8)
    async with httpx.AsyncClient(transport=httpx.MockTransport(fake)) as client:
        sent = await news_agent.owner_send(client, "leads", "sendMessage", {"text": "Заявка №1"})
        new_leads = sent["target"]["message_thread_id"]
        assert new_leads != 8 and fake.calls("sendMessage")[-1] == {"text": "Заявка №1", "chat_id": GROUP,
                                                                    "message_thread_id": new_leads}
        async with maker() as db:
            _, state = await news_agent.load_state(db)
        assert state["workspace"]["topics"]["leads"] == new_leads

        fake.dead.update({7, *range(100, 200)})  # deleted again, and the new one too
        sent = await news_agent.owner_send(client, "news", "sendMessage", {"text": "Новость"})
        assert sent["target"] == {"chat_id": "555"} and fake.calls("sendMessage")[-1]["chat_id"] == "555"


async def test_same_notice_twice_is_sent_once(maker):
    fake = Telegram()
    async with httpx.AsyncClient(transport=httpx.MockTransport(fake)) as client:
        first = await news_agent.owner_send(client, "alerts", "sendMessage", {"text": "⚠️ Ошибка"})
        again = await news_agent.owner_send(client, "alerts", "sendMessage", {"text": "⚠️ Ошибка"})
        await news_agent.owner_send(client, "alerts", "sendMessage", {"text": "⚠️ Другая ошибка"})
    assert first == again and len(fake.calls("sendMessage")) == 2


def group_message(sender, mid, **extra):
    return {"update_id": mid, "message": {"message_id": mid, "chat": {"id": GROUP, "type": "supergroup", "is_forum": True},
                                          "from": {"id": sender}, "is_topic_message": True, **extra}}


async def test_owner_and_admins_reply_from_the_topic_members_cannot(maker):
    await bind_old_group(maker)
    fake = Telegram()
    async with httpx.AsyncClient(transport=httpx.MockTransport(fake)) as client, maker() as db:
        await news_agent.ensure_topics(db, client)
        support = (await news_agent.owner_target("support"))["message_thread_id"]
        chat = telegram_support._chat("42")
        chat.name = "Асия"
        await telegram_support.notify_owner(client, "42", chat, {"id": 42}, "💬 <b>нужен оператор</b>")
        note = fake.calls("sendMessage")[-1]
        assert note["chat_id"] == GROUP and note["message_thread_id"] == support
        note_id = fake.next_id

        def reply(sender, mid):
            return group_message(sender, mid, message_thread_id=support, text="Сейчас помогу",
                                 reply_to_message={"message_id": note_id})
        await news_agent.handle_update(db, client, reply(MEMBER, 60))
        assert not fake.calls("copyMessage")
        await news_agent.handle_update(db, client, reply(ADMIN, 61))
        await news_agent.handle_update(db, client, reply(555, 62))
        assert fake.calls("copyMessage") == [{"chat_id": "42", "from_chat_id": str(GROUP), "message_id": 61},
                                             {"chat_id": "42", "from_chat_id": str(GROUP), "message_id": 62}]
        done = fake.calls("sendMessage")[-1]
        assert done["text"] == "✅ Отправлено" and done["message_thread_id"] == support

        # A reply to the same message id in the private chat is a different message: not relayed.
        await news_agent.handle_update(db, client, {"update_id": 63, "message": {
            "message_id": 63, "chat": {"id": 555, "type": "private"}, "from": {"id": 555}, "text": "привет",
            "reply_to_message": {"message_id": note_id}}})
        assert len(fake.calls("copyMessage")) == 2


async def test_buttons_and_own_news_in_the_group(maker):
    await bind_old_group(maker, announced=True)
    fake = Telegram()
    async with httpx.AsyncClient(transport=httpx.MockTransport(fake)) as client, maker() as db:
        await news_agent.ensure_topics(db, client)
        # A member writes in the news topic and asks for /topics: nothing happens.
        text = "Ремонт дороги на Защитной\nС понедельника перекроют движение у школы"
        await news_agent.handle_update(db, client, group_message(MEMBER, 70, message_thread_id=7, text=text))
        await news_agent.handle_update(db, client, group_message(MEMBER, 71, message_thread_id=7, text="/topics"))
        assert not (await db.scalars(select(News))).all() and not fake.calls("sendMessage")

        # The owner writes the same: a draft and its card in the news topic. Elsewhere in the group — not news.
        await news_agent.handle_update(db, client, group_message(555, 73, message_thread_id=8, text=text))
        await news_agent.handle_update(db, client, group_message(555, 72, message_thread_id=7, text=text))
        news = (await db.scalars(select(News))).one()
        card = fake.calls("sendPhoto")[-1]  # the card comes with our cover picture
        assert card["chat_id"] == GROUP and card["message_thread_id"] == 7 and f"nw:p:{news.id}" in json.dumps(card)

        def tap(sender):
            return {"callback_query": {"id": "cb", "data": f"nw:p:{news.id}", "from": {"id": sender},
                                       "message": {"message_id": fake.next_id, "chat": {"id": GROUP}}}}
        await news_agent.handle_update(db, client, tap(MEMBER))
        await db.refresh(news)
        assert not news.published and fake.calls("answerCallbackQuery")[-1]["text"] == "Нет доступа"
        await news_agent.handle_update(db, client, tap(ADMIN))
        await db.refresh(news)
        assert news.published

        # /topics from the owner in the group answers in the same topic.
        await news_agent.handle_update(db, client, group_message(555, 74, message_thread_id=8, text="/topics@s24bot"))
        answer = fake.calls("sendMessage")[-1]
        assert answer["message_thread_id"] == 8 and "Мой дом" in answer["text"]


async def test_group_becoming_a_supergroup_keeps_the_workspace(maker):
    async with maker() as db:
        row, state = await news_agent.load_state(db)
        state["workspace"] = {"id": -500, "title": "S24", "type": "group", "forum": False}
        news_agent.save_state(row, state)
        await db.commit()
    fake = Telegram()
    async with httpx.AsyncClient(transport=httpx.MockTransport(fake)) as client, maker() as db:
        await news_agent.handle_update(db, client, {"message": {"message_id": 1, "chat": {"id": -500, "type": "group"},
                                                                "migrate_to_chat_id": GROUP}})
        _, state = await news_agent.load_state(db)
    assert state["workspace"]["id"] == GROUP and set(state["workspace"]["topics"]) == set(news_agent.TOPICS)
    assert fake.calls("sendMessage")[-1]["chat_id"] == "555"  # the one-line note
