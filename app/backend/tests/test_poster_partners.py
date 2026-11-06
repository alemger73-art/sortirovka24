"""Posters from partner organisations: a linked chat's picture with a caption becomes a draft «Афиша» news item
waiting for the owner's tap; strangers cannot send posters; the organisation hears what was decided."""
import pytest
from sqlalchemy import select

from models.news import News
from services import news_agent as na
from services import poster_partners as pp
from tests.test_courier_telegram import FakeTelegram
from tests.test_dam_order_workflow import env  # noqa: F401  (a test database with the bot plumbing)

PHOTO = [{'file_id': 'small', 'width': 90}, {'file_id': 'big', 'width': 1080}]
CAPTION = 'Концерт «Осенний вальс»\n15 ноября, 18:00, большой зал. Вход 2000 ₸. Тел. +7 700 000 00 00'


@pytest.fixture
async def tg(env, monkeypatch):  # noqa: F811
    _, maker, _, _ = env
    fake = FakeTelegram()
    cards = []

    async def approval(client, db, news, source, url):
        cards.append((news.id, source))
        return 500 + news.id

    async def upload(client, photos):
        return 'news/poster.jpg'

    async def remember(db, message_id, news_id):
        return None

    from services import courier_telegram
    monkeypatch.setattr(na, 'tg', fake)
    monkeypatch.setattr(na, 'send_approval', approval)
    monkeypatch.setattr(na, 'upload_telegram_photo', upload)
    monkeypatch.setattr(na, 'remember_message', remember)
    monkeypatch.setenv('NEWS_TELEGRAM_BOT_TOKEN', 'test-token')
    pp._ready.clear(); courier_telegram._bot_name.clear()
    yield maker, fake, cards


async def send(maker, chat, **message):
    async with maker() as db:
        return await pp.handle_message(db, None, {'chat': {'id': chat, 'type': 'private'}, 'message_id': 9, **message})


async def test_a_linked_organisation_sends_a_poster_for_approval(tg):
    maker, fake, cards = tg
    assert not await send(maker, 800, photo=PHOTO, caption=CAPTION)  # not linked: not ours, nothing created
    async with maker() as db:
        link = await pp.new_link(db, 'ДК железнодорожников')
    assert link.startswith('https://t.me/dam_test_bot?start=pp_')
    assert await send(maker, 800, text='/start ' + link.split('start=')[1])
    assert 'ДК железнодорожников' in fake.last('sendMessage')['text']

    assert await send(maker, 800, text='Просто текст без картинки, но длинный')
    assert 'картинку афиши' in fake.last('sendMessage')['text']
    assert await send(maker, 800, photo=PHOTO, caption='Концерт')
    assert 'подпись' in fake.last('sendMessage')['text']
    assert await send(maker, 800, photo=PHOTO, media_group_id='a1')  # the album's other pictures are skipped quietly
    async with maker() as db:
        assert (await db.scalars(select(News))).all() == []

    assert await send(maker, 800, photo=PHOTO, caption=CAPTION)
    assert 'получена' in fake.last('sendMessage')['text']
    async with maker() as db:
        news = (await db.scalars(select(News))).one()
    assert news.title == 'Концерт «Осенний вальс»' and news.category == 'Афиша'
    assert news.published is False and news.status == na.PENDING and 'Организатор: ДК железнодорожников' in news.content
    assert cards == [(news.id, 'Афиша от «ДК железнодорожников»')]

    async with maker() as db:
        await na.decide(db, news.id, True)
        await pp.after_decision(db, None, news.id, True)
    assert fake.last('sendMessage')['chat_id'] == '800' and 'опубликована' in fake.last('sendMessage')['text']
    async with maker() as db:
        assert (await db.get(News, news.id)).published is True


async def test_a_link_belongs_to_one_chat_and_rejection_is_reported(tg):
    maker, fake, cards = tg
    async with maker() as db:
        code = (await pp.new_link(db, 'ДК')).split('start=')[1]
    assert await send(maker, 801, text=f'/start {code}')
    assert await send(maker, 802, text=f'/start {code}')
    assert 'устарела' in fake.last('sendMessage')['text']
    assert not await send(maker, 802, photo=PHOTO, caption=CAPTION)
    assert await send(maker, 801, photo=PHOTO, caption=CAPTION)
    news_id = cards[-1][0]
    async with maker() as db:
        await na.decide(db, news_id, False)
        await pp.after_decision(db, None, news_id, False)
        assert await db.get(News, news_id) is None
    assert 'не опубликована' in fake.last('sendMessage')['text']
    async with maker() as db:  # a second decision report is silent
        before = len(fake.calls)
        await pp.after_decision(db, None, news_id, False)
    assert len(fake.calls) == before
