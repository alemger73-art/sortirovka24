"""Ads: the author is reminded once, a few days before the 30 days run out; extending the ad
starts a new period with its own reminder. Hidden, expired and far-off ads are left alone."""
import os
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy import text

from models.announcements import Announcements
from services import ad_expiry

pytestmark = pytest.mark.skipif(not os.getenv('NB_TEST_PG'), reason='uses Postgres ON CONFLICT')
NOW = datetime(2026, 11, 4, 8, 0, tzinfo=timezone.utc)


@pytest.fixture
async def maker(monkeypatch):
    engine = create_async_engine(os.environ['NB_TEST_PG'])
    async with engine.begin() as conn:
        await conn.execute(text('DROP TABLE IF EXISTS ad_expiry_reminders'))
        await conn.run_sync(lambda c: Announcements.__table__.drop(c, checkfirst=True))
        await conn.run_sync(lambda c: Announcements.__table__.create(c))
    notices = []

    async def fake_notify(db, **kw):
        notices.append(kw)
    import services.user_notifications as un
    monkeypatch.setattr(un, 'notify_user_by_id', fake_notify)
    yield async_sessionmaker(engine, expire_on_commit=False), notices
    await engine.dispose()


def ad(id_, days, **over):
    fields = {'status': 'approved', 'active': True, 'user_id': 'u1', 'phone': '+77001112233', **over}
    return Announcements(id=id_, title=f'Ad {id_}', expires_at=(NOW + timedelta(days=days)).isoformat(), **fields)


async def test_reminds_once_per_period(maker):
    make, notices = maker
    sent_wa = []

    async def wa(phone, body):
        sent_wa.append((phone, body))
    async with make() as db:
        db.add_all([ad(1, 2), ad(2, 10), ad(3, -1), ad(4, 1, status='hidden'), ad(5, 1, active=False)])
        await db.commit()
        assert await ad_expiry.remind_expiring(db, NOW, wa) == 1
        assert await ad_expiry.remind_expiring(db, NOW, wa) == 0  # already told
    assert [n['entity_id'] for n in notices] == ['1'] and notices[0]['path'] == '/cabinet?tab=announcements'
    assert '«Ad 1» будет на сайте до 06.11' in sent_wa[0][1]
    async with make() as db:  # the author extended: a new end date gets its own reminder later
        row = await db.get(Announcements, 1)
        row.expires_at = (NOW + timedelta(days=32)).isoformat()
        await db.commit()
        assert await ad_expiry.remind_expiring(db, NOW + timedelta(days=30), wa) == 1
