"""News agent: feeds → filtered drafts → Telegram approval → published news."""
import json
from datetime import datetime, timedelta, timezone

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from core.database import Base
from models.news import News
from models.module_settings import ModuleSettings
from services import news_agent as agent

NOW = datetime.now(timezone.utc)
RFC = lambda dt: dt.strftime("%a, %d %b %Y %H:%M:%S +0000")  # noqa: E731

LOCAL_FEED = f"""<?xml version="1.0"?><rss version="2.0"><channel><title>InKaraganda</title>
<item><title>В Сортировке отремонтируют дорогу на улице Защитной</title><link>https://inkaraganda.kz/a1</link>
<description>&lt;p&gt;Ремонт начнётся в понедельник. Движение по улице будет ограничено на две недели, объезд организуют по соседним улицам.&lt;/p&gt;</description>
<pubDate>{RFC(NOW - timedelta(hours=2))}</pubDate></item>
<item><title>Старая новость Караганды</title><link>https://inkaraganda.kz/old</link>
<description>Это было давно, но текст достаточно длинный чтобы пройти проверку длины описания.</description>
<pubDate>{RFC(NOW - timedelta(days=5))}</pubDate></item>
</channel></rss>"""

NATIONAL_FEED = f"""<?xml version="1.0"?><rss version="2.0"><channel><title>Tengrinews</title>
<item><title>Курс доллара вырос</title><link>https://tengrinews.kz/x1</link><description>Нацбанк сообщил</description>
<pubDate>{RFC(NOW)}</pubDate></item>
<item><title>В Караганде отключат горячую воду в трёх микрорайонах</title><link>https://tengrinews.kz/x2</link>
<description>Отключение связано с плановыми работами на теплосетях и продлится до пятницы, сообщили в акимате.</description>
<pubDate>{RFC(NOW - timedelta(hours=1))}</pubDate></item>
</channel></rss>"""

GOOGLE_FEED = f"""<?xml version="1.0"?><rss version="2.0"><channel><title>Google News</title>
<item><title>В Караганде отключат горячую воду в трёх микрорайонах - Tengrinews</title>
<link>https://news.google.com/rss/articles/dup</link><description>&lt;a href="x"&gt;dup&lt;/a&gt;</description>
<pubDate>{RFC(NOW)}</pubDate><source url="https://tengrinews.kz">Tengrinews</source></item>
</channel></rss>"""


@pytest.fixture
async def maker(monkeypatch):
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all, tables=[News.__table__, ModuleSettings.__table__])
    monkeypatch.setenv("NEWS_AGENT_FEEDS", "local:https://inkaraganda.kz/rss,https://tengrinews.kz/news.rss,https://news.google.com/rss/search?q=x")
    monkeypatch.setenv("NEWS_TELEGRAM_BOT_TOKEN", "123:test")
    monkeypatch.setenv("NEWS_TELEGRAM_CHAT_ID", "555")
    monkeypatch.delenv("NEWS_TELEGRAM_ADMIN_IDS", raising=False)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    yield async_sessionmaker(engine, expire_on_commit=False)
    await engine.dispose()


ARTICLE = """<html><head><meta property="og:image" content="https://inkaraganda.kz/photo.jpg"></head><body>
<nav><p>Меню сайта и ссылки на все разделы портала новостей</p></nav><article>
<p>Ремонт улицы Защитной в Сортировке начнётся в понедельник, сообщили в отделе ЖКХ акимата района.</p>
<p>Движение будет ограничено на две недели, объезд организуют по улицам Ленина и Мира. Автобусы №12 и №45 пойдут в объезд.</p>
<p>Подпишитесь на наш Telegram-канал, чтобы не пропускать новости.</p></article></body></html>"""


def transport(sent: list):
    def handler(request: httpx.Request) -> httpx.Response:
        url = str(request.url)
        if url.endswith("/a1") or url.endswith("/x2"):
            return httpx.Response(200, text=ARTICLE, headers={"content-type": "text/html"})
        if "inkaraganda" in url:
            return httpx.Response(200, content=LOCAL_FEED.encode())
        if "tengrinews" in url:
            return httpx.Response(200, content=NATIONAL_FEED.encode())
        if "news.google" in url:
            return httpx.Response(200, content=GOOGLE_FEED.encode())
        if "api.telegram.org" in url:
            body = json.loads(request.content or b"{}")
            sent.append((url.rsplit("/", 1)[-1], body))
            return httpx.Response(200, json={"ok": True, "result": {"message_id": len(sent)}})
        return httpx.Response(404)
    return httpx.MockTransport(handler)


def test_parse_and_score():
    items = agent.parse_feed(GOOGLE_FEED.encode())
    assert items[0]["title"] == "В Караганде отключат горячую воду в трёх микрорайонах"
    assert items[0]["source"] == "Tengrinews"
    assert agent.score({"title": "В Сортировке ремонт", "summary": ""}) == 100
    assert agent.score({"title": "Курс доллара", "summary": ""}) == 0
    assert agent.score({"title": "Новость", "summary": "", "local": True}) == 30
    assert agent.guess_category("отключат горячую воду") == "ЖКХ"


def test_unsafe_xml_rejected():
    bomb = '<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "aaaa">]><rss><channel><item><title>&a;</title></item></channel></rss>'
    with pytest.raises(Exception):
        agent.parse_feed(bomb)


async def test_collect_creates_drafts_and_asks_for_approval(maker):
    sent: list = []
    async with httpx.AsyncClient(transport=transport(sent)) as client, maker() as db:
        run = await agent.collect(db, client, force=True)
        assert run["error"] is None and run["sent"] == 2
        news = (await db.scalars(select(News).order_by(News.id))).all()
        # Sortirovka first; Google duplicate of the Tengrinews story is skipped; old and national items ignored.
        assert [n.title for n in news] == ["В Сортировке отремонтируют дорогу на улице Защитной",
                                          "В Караганде отключат горячую воду в трёх микрорайонах"]
        assert all(n.published is False and n.status == agent.PENDING for n in news)
        assert "Источник: InKaraganda — https://inkaraganda.kz/a1" in news[0].content
        assert news[1].category == "ЖКХ"
        # Article text is read from the page; the site's photo is not reused, our cover is.
        assert "По сообщению InKaraganda: Ремонт улицы Защитной" in (news[0].short_description or "") + news[0].content
        assert "Подпишитесь" not in news[0].content
        assert news[0].image_url.startswith("https://www.sortirovka24.kz/news-covers/")
        methods = [m for m, _ in sent]
        assert methods == ["sendPhoto", "sendPhoto"]
        assert sent[0][1]["chat_id"] == "555" and "Новость на согласование" in sent[0][1]["caption"]
        assert sent[0][1]["photo"].startswith("https://www.sortirovka24.kz/news-covers/")
        assert sent[0][1]["reply_markup"]["inline_keyboard"][0][0]["callback_data"].startswith("nw:p:")

        # A second pass proposes nothing new.
        sent.clear()
        assert await agent.collect(db, client) is None  # not due yet
        again = await agent.collect(db, client, force=True)
        assert again["sent"] == 0 and not sent


async def test_owner_publishes_and_rejects(maker):
    sent: list = []
    async with httpx.AsyncClient(transport=transport(sent)) as client, maker() as db:
        await agent.collect(db, client, force=True)
        first, second = [n.id for n in (await db.scalars(select(News).order_by(News.id))).all()]

        def tap(news_id, action, sender="555", chat="555"):
            return {"callback_query": {"id": "cb", "data": f"nw:{action}:{news_id}", "from": {"id": int(sender)},
                                       "message": {"message_id": 1, "chat": {"id": int(chat)}}}}

        # A stranger cannot publish, even from their own chat.
        await agent.handle_update(db, client, tap(first, "p", sender="999", chat="999"))
        assert (await db.get(News, first)).published is False

        await agent.handle_update(db, client, tap(first, "p"))
        published = await db.get(News, first)
        assert published.published is True and published.status == "published"

        await agent.handle_update(db, client, tap(second, "r"))
        assert await db.get(News, second) is None

        # Repeated taps are harmless.
        assert (await agent.decide(db, first, True))[0] == "Уже опубликовано"
        assert (await agent.decide(db, second, True))[0] == "Черновик уже удалён"
        assert sent[-2][0] == "editMessageReplyMarkup"


async def test_ai_mode_uses_own_retelling(maker, monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
    sent: list = []
    base = transport(sent)

    def handler(request):
        if "api.anthropic.com" in str(request.url):
            reply = [{"index": 1, "title": "Горячую воду отключат в трёх микрорайонах",
                      "text": "До пятницы в трёх микрорайонах Караганды не будет горячей воды из-за работ на теплосетях.",
                      "category": "ЖКХ"}]
            return httpx.Response(200, json={"content": [{"type": "text", "text": json.dumps(reply, ensure_ascii=False)}]})
        return base.handle_request(request)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client, maker() as db:
        run = await agent.collect(db, client, force=True)
        assert run["sent"] == 1
        news = (await db.scalars(select(News))).one()
        assert news.title == "Горячую воду отключат в трёх микрорайонах"
        assert news.content.startswith("До пятницы")
        # The Sortirovka item the editor did not pick is remembered and never proposed again.
        monkeypatch.delenv("ANTHROPIC_API_KEY")
        again = await agent.collect(db, client, force=True)
        assert again["found"] == 0


def test_working_hours():
    assert agent.in_working_hours(datetime(2026, 10, 18, 5, 0, tzinfo=timezone.utc))  # 10:00 Almaty
    assert not agent.in_working_hours(datetime(2026, 10, 18, 18, 0, tzinfo=timezone.utc))  # 23:00 Almaty


def test_same_story_from_two_sites_is_detected():
    a = agent.title_key("Бутылка с мочой пробила два стекла авто на трассе Караганда - Алматы")
    b = agent.title_key("Бутылка с мочой навылет пробила машину на трассе Караганда – Алматы")
    c = agent.title_key("В Караганде обновляют подстанцию «Фёдоровка»")
    assert agent.similar(b, [agent._words(a)])
    assert not agent.similar(c, [agent._words(a)])


def test_schedule():
    morning = datetime(2026, 10, 18, 5, 0, tzinfo=timezone.utc)  # 10:00 Almaty
    assert agent.run_due({}, morning)
    assert not agent.run_due({"last_run": (morning - timedelta(minutes=30)).isoformat()}, morning)
    assert agent.run_due({"last_run": (morning - timedelta(hours=3)).isoformat()}, morning)


def test_lead_is_not_repeated_in_body():
    lead, body = agent.split_lead("Ремонт начнётся в понедельник. Движение по улице ограничат на две недели.")
    assert lead == "Ремонт начнётся в понедельник." and body.startswith("Движение")
    assert agent.split_lead("Подробности — по ссылке на источник ниже.") == (None, "Подробности — по ссылке на источник ниже.")


async def test_owner_reply_with_photo_sets_news_picture(maker, monkeypatch):
    sent: list = []
    base = transport(sent)

    def handler(request):
        url = str(request.url)
        if url.endswith("/getFile"):
            sent.append(("getFile", {}))
            return httpx.Response(200, json={"ok": True, "result": {"file_path": "photos/p.jpg"}})
        if "/file/bot" in url:
            return httpx.Response(200, content=b"\xff\xd8jpegbytes")
        return base.handle_request(request)

    class FakeStorage:
        def _make_upload_token(self, bucket, key, thumbnail_key=None, is_image=False):
            return key

        async def upload_via_token(self, token, data, content_type=None):
            assert data.startswith(b"\xff\xd8")
            return {"object_key": token}

    import services.storage as storage_module
    monkeypatch.setattr(storage_module, "StorageService", FakeStorage)
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client, maker() as db:
        await agent.collect(db, client, force=True)
        card = next(p for m, p in sent if m == "sendPhoto")
        card_id = sent.index(("sendPhoto", card)) + 1  # mock message_id = position
        news_id = int(card["reply_markup"]["inline_keyboard"][0][0]["callback_data"].split(":")[2])
        photo_reply = {"message": {"message_id": 99, "chat": {"id": 555, "type": "private"}, "from": {"id": 555},
                                   "photo": [{"file_id": "a", "file_size": 10}, {"file_id": "b", "file_size": 900}],
                                   "reply_to_message": {"message_id": card_id}}}
        await agent.handle_update(db, client, photo_reply)
        news = await db.get(News, news_id)
        assert news.image_url.startswith("news/") and news.image_url.endswith(".webp") or news.image_url.startswith("news/")
        assert "Фото добавлено" in sent[-1][1]["text"]

        # A stranger's photo reply changes nothing.
        before = news.image_url
        photo_reply["message"]["from"]["id"] = 999
        photo_reply["message"]["chat"]["id"] = 999
        await agent.handle_update(db, client, photo_reply)
        assert (await db.get(News, news_id)).image_url == before
