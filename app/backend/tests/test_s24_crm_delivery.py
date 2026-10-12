"""Offline integration tests: real transactions, fake external transports."""
import importlib.util
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock

import httpx
import pytest
import pytest_asyncio
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from core.database import Base
from models.crm_delivery import CrmDelivery, FeedbackRequest
from models.master_requests import Master_requests
from models.become_master_requests import Become_master_requests
from models.business_partner_requests import Business_partner_requests
from services.crm_delivery import enqueue, deliver_one, cells, telegram_text
from services.crm_transports import GoogleSheets, Telegram, DeliveryError


@pytest_asyncio.fixture
async def factory(monkeypatch):
    monkeypatch.setenv("S24_CRM_ENABLED", "true")
    monkeypatch.setenv("S24_CRM_SEND_ENABLED", "true")
    monkeypatch.setenv("EXTERNAL_SIDE_EFFECTS", "enabled")
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(lambda c: Base.metadata.create_all(c, tables=[
            CrmDelivery.__table__, FeedbackRequest.__table__, Master_requests.__table__,
            Become_master_requests.__table__, Business_partner_requests.__table__]))
    yield async_sessionmaker(engine, expire_on_commit=False)
    await engine.dispose()


async def seed(factory, source="business"):
    async with factory() as db:
        row = Business_partner_requests(name="Автопрофи", phone="+77001234567", activity="local", description="=IMPORTXML(1)")
        db.add(row)
        await enqueue(db, source, row)
        await db.commit()


def transports():
    return SimpleNamespace(write=AsyncMock(), crm_url="https://docs.google.com/spreadsheets/d/test/edit"), SimpleNamespace(send=AsyncMock())


@pytest.mark.asyncio
async def test_transaction_rollback_loses_neither_source_nor_queue(factory):
    async with factory() as db:
        row = Master_requests(client_name="Test")
        db.add(row)
        await enqueue(db, "master", row)
        await db.rollback()
    async with factory() as db:
        assert await db.scalar(select(func.count()).select_from(Master_requests)) == 0
        assert await db.scalar(select(func.count()).select_from(CrmDelivery)) == 0


@pytest.mark.asyncio
async def test_site_services_enqueue_atomically(factory):
    from services.master_requests import Master_requestsService
    from services.become_master_requests import Become_master_requestsService
    async with factory() as db:
        row = await Master_requestsService(db).create({"client_name": "Client", "master_id": 42})
        await Become_master_requestsService(db).create({"name": "Master", "phone": "+77001234567"})
        events = (await db.scalars(select(CrmDelivery).order_by(CrmDelivery.id))).all()
        assert [e.source for e in events] == ["master", "become_master"]
        assert events[0].source_id == row.id
        assert events[0].payload["master_id"] == 42


@pytest.mark.asyncio
async def test_order_restart_and_no_repeat(factory):
    await seed(factory)
    sheets, telegram = transports()
    async with factory() as db:
        assert await deliver_one(db, sheets, telegram, now=100)
    telegram.send.assert_not_awaited()
    # A new session represents a process restart after the Sheets checkpoint.
    async with factory() as db:
        assert await deliver_one(db, sheets, telegram, now=101)
    async with factory() as db:
        assert not await deliver_one(db, sheets, telegram, now=102)
    assert sheets.write.await_count == telegram.send.await_count == 1
    assert sheets.write.call_args.args[0] == 2
    assert telegram.send.call_args.args[0] == "BUSINESS"


@pytest.mark.asyncio
async def test_sheets_failure_blocks_telegram_and_retries_same_row(factory):
    await seed(factory)
    sheets, telegram = transports()
    sheets.write.side_effect = [TimeoutError("secret/client data"), None]
    async with factory() as db:
        await deliver_one(db, sheets, telegram, now=100)
    async with factory() as db:
        e = await db.get(CrmDelivery, 1)
        assert e.last_error == "TimeoutError" and e.next_attempt_at == 130
        assert not await deliver_one(db, sheets, telegram, now=129)
    async with factory() as db:
        await deliver_one(db, sheets, telegram, now=130)
    assert [call.args[0] for call in sheets.write.call_args_list] == [2, 2]
    telegram.send.assert_not_awaited()


@pytest.mark.asyncio
async def test_telegram_failure_keeps_sheets_checkpoint_and_dead_letter(factory):
    await seed(factory)
    sheets, telegram = transports()
    async with factory() as db:
        await deliver_one(db, sheets, telegram, now=0)
    telegram.send.side_effect = RuntimeError("token should never be saved")
    for i in range(10):
        async with factory() as db:
            await deliver_one(db, sheets, telegram, now=10000 * (i + 1))
    async with factory() as db:
        e = await db.get(CrmDelivery, 1)
        assert e.dead and e.sheets_done and not e.telegram_done
        assert e.attempts == 10 and e.last_error == "RuntimeError"
        assert not await deliver_one(db, sheets, telegram, now=9999999)
    assert sheets.write.await_count == 1


@pytest.mark.asyncio
@pytest.mark.parametrize("flag,value", [("S24_CRM_ENABLED", "false"), ("S24_CRM_SEND_ENABLED", "false"), ("EXTERNAL_SIDE_EFFECTS", "disabled")])
async def test_disable_prevents_all_external_effects(factory, monkeypatch, flag, value):
    await seed(factory)
    monkeypatch.setenv(flag, value)
    sheets, telegram = transports()
    async with factory() as db:
        assert not await deliver_one(db, sheets, telegram)
    sheets.write.assert_not_awaited()
    telegram.send.assert_not_awaited()


@pytest.mark.asyncio
async def test_disabled_capture_needs_no_queue_table(factory, monkeypatch):
    monkeypatch.delenv("S24_CRM_ENABLED")
    async with factory() as db:
        await enqueue(db, "business", SimpleNamespace())
        assert await db.scalar(select(func.count()).select_from(CrmDelivery)) == 0


@pytest.mark.asyncio
async def test_public_business_and_feedback_are_durable_without_network(factory, monkeypatch):
    from routers.business_partner import apply_for_partnership, BusinessApplyRequest
    from routers.feedback import report_issue, ReportIssueRequest
    monkeypatch.setattr("routers.business_partner.notify_new_business_partner", AsyncMock(side_effect=AssertionError("network")))
    monkeypatch.setattr("routers.feedback.notify_app_issue", AsyncMock(side_effect=AssertionError("network")))
    monkeypatch.setattr("services.admin_alerts.alert_new_business_partner", AsyncMock())
    request = SimpleNamespace(client=SimpleNamespace(host="127.0.0.123"), headers={})
    async with factory() as db:
        result = await apply_for_partnership(BusinessApplyRequest(name="Автопрофи", phone="+77001234567", activity="local"), request, db)
        assert result.success
        result = await report_issue(ReportIssueRequest(description="Не открывается страница", contact_name="Client"), request, db)
        assert result.success
        assert await db.scalar(select(func.count()).select_from(FeedbackRequest)) == 1
        assert await db.scalar(select(func.count()).select_from(CrmDelivery)) == 2


@pytest.mark.asyncio
async def test_fixed_range_raw_input_and_header_identity(factory):
    await seed(factory)
    async with factory() as db:
        event = await db.get(CrmDelivery, 1)
        values = cells(event)
        assert values[7] == "=IMPORTXML(1)"
        assert values[11] == "tel:+77001234567" and values[12] == "https://wa.me/77001234567"
    calls = []
    def handler(request):
        calls.append(request)
        if request.method == "GET":
            return httpx.Response(200, json={"values": [["ID С24"]]})
        return httpx.Response(200, json={"updatedRows": 1})
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        sheets = GoogleSheets.__new__(GoogleSheets)
        sheets.client, sheets.spreadsheet, sheets.tab = client, "test", "CRM's tab"
        sheets.credentials = SimpleNamespace(valid=True, token="test-token")
        await sheets.write(2, values)
    assert calls[-1].url.params["valueInputOption"] == "RAW"
    assert "A2:N2" in str(calls[-1].url.copy_with(query=None)).replace("%3A", ":")


@pytest.mark.asyncio
@pytest.mark.parametrize("keys", [[], [["Foreign tab"]], [["ID С24"], ["other:1"]], [["ID С24"], [], ["business:1"]]])
async def test_sheets_refuses_foreign_or_moved_rows(factory, keys):
    puts = []
    def handler(request):
        if request.method == "PUT":
            puts.append(request)
        return httpx.Response(200, json={"values": keys})
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        sheets = GoogleSheets.__new__(GoogleSheets)
        sheets.client, sheets.spreadsheet, sheets.tab = client, "test", "CRM"
        sheets.credentials = SimpleNamespace(valid=True, token="token")
        with pytest.raises(DeliveryError):
            await sheets.write(2, ["business:1"])
    assert not puts


@pytest.mark.asyncio
async def test_telegram_200_ok_false_is_failure(factory, monkeypatch):
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN_BUSINESS", "test-token")
    monkeypatch.setenv("TELEGRAM_CHAT_ID_BUSINESS", "test-chat")
    async with httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(200, json={"ok": False}))) as client:
        with pytest.raises(DeliveryError):
            await Telegram(client).send("BUSINESS", "test")


def test_migration_upgrade_on_empty_local_database():
    from sqlalchemy import create_engine, inspect
    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    path = Path(__file__).parents[1] / "alembic/versions/s2420261012_crm_delivery.py"
    spec = importlib.util.spec_from_file_location("crm_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    engine = create_engine("sqlite://")
    with engine.begin() as conn:
        with Operations.context(MigrationContext.configure(conn)):
            migration.upgrade()
        assert {"crm_deliveries", "feedback_requests"} <= set(inspect(conn).get_table_names())
        assert inspect(conn).get_unique_constraints("crm_deliveries")[0]["column_names"] == ["source", "source_id"]
    engine.dispose()
