"""DÄM ALEM courier invite: whoever opens the owner's one-time link and shares their Telegram number becomes a
verified courier linked to that chat; the link works once; another person's contact is refused."""
import pytest
from sqlalchemy import select, text

from models.auth import User
from models.logistics import CourierProfile
from services import courier_invite as ci
from tests.test_courier_telegram import FakeTelegram
from tests.test_dam_order_workflow import env  # noqa: F401  (the shared DAM workflow fixture)


@pytest.fixture
async def tg(env, monkeypatch):  # noqa: F811
    _, maker, _, _ = env
    fake = FakeTelegram()
    import services.news_agent as news
    from services import courier_telegram
    monkeypatch.setattr(news, 'tg', fake)
    monkeypatch.setenv('NEWS_TELEGRAM_BOT_TOKEN', 'test-token')
    ci._ready.clear(); courier_telegram._ready.clear(); courier_telegram._bot_name.clear()
    yield maker, fake


async def send(maker, chat, **message):
    async with maker() as db:
        return await ci.handle_message(db, None, {'chat': {'id': chat, 'type': 'private'}, **message})


async def test_the_link_makes_a_linked_verified_courier_once(tg):
    maker, fake = tg
    async with maker() as db:
        link = await ci.new_link(db)
    code = link.split('start=')[1]
    assert link.startswith('https://t.me/dam_test_bot?start=ci_')
    assert await send(maker, 700, text=f'/start {code}')
    assert fake.last('sendMessage')['reply_markup']['keyboard'][0][0]['request_contact'] is True
    me = {'id': 700, 'first_name': 'Ержан'}
    assert await send(maker, 700, **{'from': me, 'contact': {'user_id': 999, 'phone_number': '+77001110000'}})
    assert 'собственный номер' in fake.last('sendMessage')['text']
    assert await send(maker, 700, **{'from': me, 'contact': {'user_id': 700, 'phone_number': '77005554433'}})
    assert 'Ержан, вы курьер DÄM ALEM' in fake.last('sendMessage')['text']
    async with maker() as db:
        user = await db.scalar(select(User).where(User.phone == '+77005554433'))
        assert user and user.name == 'Ержан'
        assert (await db.get(CourierProfile, user.id)).is_verified
        assert await db.scalar(text("SELECT chat_id FROM courier_telegram WHERE user_id = :u"), {'u': user.id}) == '700'
    assert await send(maker, 701, text=f'/start {code}')
    assert 'устарела' in fake.last('sendMessage')['text']  # one link, one courier


async def test_an_unrelated_contact_is_not_ours(tg):
    maker, _ = tg
    assert not await send(maker, 702, **{'from': {'id': 702}, 'contact': {'user_id': 702, 'phone_number': '77000000001'}})
