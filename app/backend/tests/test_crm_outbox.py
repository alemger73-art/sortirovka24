"""Existing inbox remains reliable if a push worker crashes or has no device."""
from datetime import timedelta
from unittest.mock import AsyncMock
import pytest
from sqlalchemy import select
from models.user_notifications import UserNotification
from services import loyalty as L
from services.user_notifications import deliver_queued_notifications, enqueue_notification
from tests.test_loyalty import store

@pytest.mark.asyncio
async def test_stale_push_claim_is_visible_without_blind_resend(store,monkeypatch):
    monkeypatch.setattr('core.deploy_safety.external_side_effects_allowed',lambda:False)
    sender=AsyncMock();monkeypatch.setattr('services.user_notifications.broadcast_push',sender)
    async with store() as db:
        await enqueue_notification(db,user_id='a',category='bonus',key='test:one',title='Bonus',body='Ready',path='/cabinet')
        await db.flush()
        row=await db.scalar(select(UserNotification));row.push_status='sending';row.push_claimed_at=L.now()-timedelta(minutes=11)
        await db.commit();await deliver_queued_notifications(db);await db.refresh(row)
        assert row.push_status=='unknown' and not row.is_read
        sender.assert_not_awaited()

@pytest.mark.asyncio
async def test_outbox_dispatches_committed_entry_once(store,monkeypatch):
    monkeypatch.setattr('core.deploy_safety.external_side_effects_allowed',lambda:True)
    sender=AsyncMock(return_value={'sent':1,'total':1});monkeypatch.setattr('services.user_notifications.broadcast_push',sender)
    async with store() as db:
        await enqueue_notification(db,user_id='a',category='bonus',key='test:once',title='Bonus',body='Ready',path='/cabinet')
        await db.commit();await deliver_queued_notifications(db);await deliver_queued_notifications(db)
        row=await db.scalar(select(UserNotification))
        assert row.push_status=='sent' and row.push_attempts==1
        sender.assert_awaited_once()
