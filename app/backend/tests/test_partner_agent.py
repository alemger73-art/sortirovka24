"""Partner leads: agent announces new leads, owner moves stages from Telegram,
CRM keeps notes/next contact as events, reminders fire once."""
import json
from datetime import datetime, timedelta, timezone

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from core.database import Base
from models.business_partner_requests import Business_partner_requests as Lead
from models.module_settings import ModuleSettings
from models.news import News
from models.user_management import UserAction
from services import news_agent, partner_agent, partner_crm


@pytest.fixture
async def maker(monkeypatch):
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all, tables=[
            Lead.__table__, UserAction.__table__, ModuleSettings.__table__, News.__table__])
    monkeypatch.setenv("NEWS_TELEGRAM_BOT_TOKEN", "123:test")
    monkeypatch.setenv("NEWS_TELEGRAM_CHAT_ID", "555")
    monkeypatch.delenv("NEWS_TELEGRAM_ADMIN_IDS", raising=False)
    yield async_sessionmaker(engine, expire_on_commit=False)
    await engine.dispose()


def telegram(sent):
    def handler(request):
        sent.append((str(request.url).rsplit("/", 1)[-1], json.loads(request.content or b"{}")))
        return httpx.Response(200, json={"ok": True, "result": {"message_id": len(sent)}})
    return httpx.MockTransport(handler)


def lead(**kw):
    base = dict(name="Кафе Арман", phone="+77001112233", activity="Кафе и доставка еды", status="new",
                created_at=datetime.now(timezone.utc).isoformat())
    base.update(kw)
    return Lead(**base)


async def test_new_leads_are_checked_announced_and_staged(maker):
    sent = []
    async with httpx.AsyncClient(transport=telegram(sent)) as client, maker() as db:
        db.add(lead(name="Старая заявка"))
        await db.commit()
        # First start only remembers where history ends.
        assert await partner_agent.process_new(db, client) == 0 and not sent

        db.add(lead(name="Кафе Арман 2"))  # same phone → duplicate of №1
        db.add(lead(name="СТО Мотор", phone="+77005556677", activity="Ремонт авто"))
        await db.commit()
        assert await partner_agent.process_new(db, client) == 2
        assert [m for m, _ in sent] == ["sendMessage", "sendMessage"]
        first = sent[0][1]
        assert first["chat_id"] == "555" and "Повторная заявка: уже была №1" in first["text"]
        assert "Категория: Еда и кафе" in first["text"]
        assert any(b.get("url", "").startswith("https://wa.me/77001112233") for row in first["reply_markup"]["inline_keyboard"] for b in row)

        history = await partner_crm.events(db, [2, 3])
        assert partner_crm.summary(history[2])["duplicate_of"] == 1
        assert partner_crm.summary(history[3])["category"] == "Авто"
        assert await partner_agent.process_new(db, client) == 0  # nothing announced twice

        # Owner taps «Переговоры» in Telegram.
        tap = {"callback_query": {"id": "cb", "data": "pl:n:3", "from": {"id": 555},
                                  "message": {"message_id": 9, "chat": {"id": 555}}}}
        await news_agent.handle_update(db, client, tap)
        assert (await db.get(Lead, 3)).status == "negotiation"
        assert sent[-1] == ("answerCallbackQuery", {"callback_query_id": "cb", "text": "Этап: Переговоры"})

        # A stranger cannot.
        tap["callback_query"]["from"]["id"] = 999
        tap["callback_query"]["message"]["chat"]["id"] = 999
        tap["callback_query"]["data"] = "pl:r:3"
        await news_agent.handle_update(db, client, tap)
        assert (await db.get(Lead, 3)).status == "negotiation"


async def test_reminders_fire_once(maker):
    sent = []
    noon = datetime(2026, 10, 19, 7, 0, tzinfo=timezone.utc)  # 12:00 Almaty
    async with httpx.AsyncClient(transport=telegram(sent)) as client, maker() as db:
        db.add(lead(created_at=(noon - timedelta(hours=30)).isoformat()))
        db.add(lead(name="Салон", phone="+77009998877", status="in_progress", created_at=noon.isoformat()))
        await db.commit()
        partner_crm.record(db, 2, "partner_lead_next_contact", {"at": "2026-10-19"})
        await db.commit()
        assert await partner_agent.remind(db, client, noon) == 2
        texts = [p["text"] for _, p in sent]
        assert any("ждёт ответа больше суток" in t for t in texts)
        assert any("Сегодня запланирован контакт" in t for t in texts)
        assert await partner_agent.remind(db, client, noon + timedelta(minutes=20)) == 0
        assert await partner_agent.remind(db, client, noon.replace(hour=17)) == 0  # 22:00 local: quiet


async def test_channel_binding_and_posting(maker):
    sent = []
    async with httpx.AsyncClient(transport=telegram(sent)) as client, maker() as db:
        await news_agent.handle_update(db, client, {"my_chat_member": {
            "chat": {"id": -100777, "title": "S24", "type": "channel"}, "from": {"id": 555},
            "new_chat_member": {"status": "administrator"}}})
        assert "Канал «S24» подключён" in sent[-1][1]["text"]
        news = News(title="Тест", content="Текст новости достаточно длинный.\n\nИсточник: X — https://x.kz/1",
                    short_description="Лид.", published=False, status=news_agent.PENDING, category="ЖКХ")
        db.add(news)
        await db.commit()
        tap = {"callback_query": {"id": "cb", "data": f"nw:p:{news.id}", "from": {"id": 555},
                                  "message": {"message_id": 1, "chat": {"id": 555}}}}
        await news_agent.handle_update(db, client, tap)
        posts = [p for m, p in sent if m == "sendMessage" and p.get("chat_id") == -100777]
        assert posts and "Читать на «Сортировка 24»" in posts[0]["text"]
        assert sent[-1][1]["text"] == "Опубликовано на сайте и в «S24»"

        # Someone else adding the bot somewhere does not redirect the news.
        await news_agent.handle_update(db, client, {"my_chat_member": {
            "chat": {"id": -100888, "title": "Чужой", "type": "channel"}, "from": {"id": 999},
            "new_chat_member": {"status": "administrator"}}})
        _, state = await news_agent.load_state(db)
        assert state["channel"]["id"] == -100777


def test_category_and_dates():
    assert partner_crm.category_of("Салон красоты") == "Красота и здоровье"
    assert partner_crm.category_of("Что-то необычное") == "Другое"
    assert partner_crm.parse_next_contact("2026-10-20") == "2026-10-20"
    with pytest.raises(ValueError):
        partner_crm.parse_next_contact("завтра")
