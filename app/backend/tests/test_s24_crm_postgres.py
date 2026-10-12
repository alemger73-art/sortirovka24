"""Optional real locking test, strictly restricted to a disposable local database."""
import asyncio
import os
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from sqlalchemy import text, select
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from models.crm_delivery import CrmDelivery
from services.crm_delivery import deliver_one


@pytest.mark.asyncio
@pytest.mark.skipif(not os.getenv("S24_CRM_TEST_POSTGRES_URL"), reason="requires disposable local PostgreSQL")
async def test_parallel_consumers_skip_locked_without_double_write(monkeypatch):
    url = make_url(os.environ["S24_CRM_TEST_POSTGRES_URL"])
    assert url.host in ("localhost", "127.0.0.1") and url.database == "s24_crm_test"
    monkeypatch.setenv("S24_CRM_ENABLED", "true")
    monkeypatch.setenv("S24_CRM_SEND_ENABLED", "true")
    monkeypatch.setenv("EXTERNAL_SIDE_EFFECTS", "enabled")
    schema = "crm_test_" + uuid.uuid4().hex
    admin = create_async_engine(url)
    async with admin.begin() as conn:
        await conn.execute(text(f'CREATE SCHEMA "{schema}"'))
    engine = create_async_engine(url, connect_args={"server_settings": {"search_path": schema}})
    try:
        async with engine.begin() as conn:
            await conn.run_sync(CrmDelivery.__table__.create)
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with factory() as db:
            for i in (1, 2):
                db.add(CrmDelivery(source="business", source_id=i, payload={"name": "Test"}))
            await db.commit()
        entered, release = asyncio.Event(), asyncio.Event()
        rows = []
        async def first_write(row, values):
            rows.append(row)
            entered.set()
            await release.wait()
        telegram = SimpleNamespace(send=AsyncMock())
        first = SimpleNamespace(write=first_write, crm_url="test")
        second = SimpleNamespace(write=AsyncMock(), crm_url="test")
        async def run_first():
            async with factory() as db:
                return await deliver_one(db, first, telegram)
        task = asyncio.create_task(run_first())
        try:
            await asyncio.wait_for(entered.wait(), timeout=5)
            async with factory() as db:
                assert await asyncio.wait_for(deliver_one(db, second, telegram), timeout=5)
            assert rows == [2]
            assert second.write.call_args.args[0] == 3
            telegram.send.assert_not_awaited()
        finally:
            release.set()
            await asyncio.wait_for(task, timeout=5)
        for _ in range(2):
            async with factory() as db:
                assert await deliver_one(db, second, telegram)
        async with factory() as db:
            assert not await deliver_one(db, second, telegram)
            assert all(e.telegram_done for e in (await db.scalars(select(CrmDelivery))).all())
        assert telegram.send.await_count == 2
        assert second.write.await_count == 1
    finally:
        await engine.dispose()
        async with admin.begin() as conn:
            await conn.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        await admin.dispose()
