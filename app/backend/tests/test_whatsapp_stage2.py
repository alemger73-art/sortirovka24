"""Stage 2 WhatsApp bot: sessions, intents, catalog replies (no OpenAI / orders)."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from services.whatsapp_ai_bot.catalog import (
    CatalogCategory,
    CatalogItem,
    CatalogSnapshot,
    find_category,
    search_items,
)
from services.whatsapp_ai_bot.cloud_api import WhatsAppCloudClient
from services.whatsapp_ai_bot.commands import parse_intent
from services.whatsapp_ai_bot.config import get_whatsapp_config
from services.whatsapp_ai_bot.handler import build_reply_text, handle_inbound_message
from services.whatsapp_ai_bot.ingress import extract_inbound_message
from services.whatsapp_ai_bot.session_store import reset_session_store_for_tests, get_session_store


@pytest.fixture(autouse=True)
def _reset_sessions():
    reset_session_store_for_tests()
    yield
    reset_session_store_for_tests()


def _catalog() -> CatalogSnapshot:
    return CatalogSnapshot(
        restaurant_id=1,
        restaurant_name="DAM ALEM",
        categories=[
            CatalogCategory(id=10, name="Пицца"),
            CatalogCategory(id=11, name="Донеры"),
            CatalogCategory(id=12, name="Напитки"),
        ],
        items=[
            CatalogItem(id=1, name="Маргарита", price=2500, category_id=10),
            CatalogItem(id=2, name="Пепперони", price=2900, category_id=10),
            CatalogItem(id=3, name="Донер куриный", price=1500, category_id=11),
            CatalogItem(id=4, name="Кола 0.5", price=500, category_id=12),
        ],
        min_order_amount=2000,
        working_hours="10:00 – 22:00",
    )


def test_parse_intent_menu_and_help():
    assert parse_intent("меню").name == "menu"
    assert parse_intent("HELP").name == "help"
    assert parse_intent("привет").name == "help"


def test_parse_intent_category_and_search():
    cat = parse_intent("категория пицца")
    assert cat.name == "category"
    assert "пицц" in cat.query
    search = parse_intent("найди донер")
    assert search.name == "search"
    assert "донер" in search.query
    lookup = parse_intent("пицца")
    assert lookup.name == "lookup"


def test_find_category_and_search_items():
    catalog = _catalog()
    assert find_category(catalog.categories, "пицца").id == 10
    found = search_items(catalog.items, "донер")
    assert len(found) == 1
    assert found[0].name == "Донер куриный"


def test_build_reply_menu_lists_categories():
    text = build_reply_text(parse_intent("меню"), _catalog())
    assert "Пицца" in text
    assert "Донеры" in text
    help_msg = build_reply_text(parse_intent("помощь"), _catalog())
    assert "Команды" in help_msg
    assert "меню" in help_msg.lower()


def test_build_reply_category_lists_items():
    text = build_reply_text(parse_intent("пицца"), _catalog())
    assert "Маргарита" in text
    assert "2 500" in text or "2500" in text.replace(" ", "")


def test_session_dedupes_message_ids():
    store = get_session_store(ttl_seconds=600)
    assert store.mark_seen("77001112233", "wamid.1") is True
    assert store.mark_seen("77001112233", "wamid.1") is False
    assert store.mark_seen("77001112233", "wamid.2") is True


def test_extract_inbound_message_text():
    payload = {
        "object": "whatsapp_business_account",
        "entry": [
            {
                "changes": [
                    {
                        "value": {
                            "contacts": [{"wa_id": "77009876543"}],
                            "messages": [
                                {
                                    "from": "77009876543",
                                    "id": "wamid.ABC",
                                    "type": "text",
                                    "text": {"body": "меню"},
                                }
                            ],
                        }
                    }
                ]
            }
        ],
    }
    inbound = extract_inbound_message(payload)
    assert inbound is not None
    assert inbound.wa_id == "77009876543"
    assert inbound.text == "меню"
    assert inbound.message_id == "wamid.ABC"


@pytest.mark.asyncio
async def test_cloud_client_skips_without_credentials(monkeypatch):
    monkeypatch.setenv("WHATSAPP_ACCESS_TOKEN", "")
    monkeypatch.setenv("WHATSAPP_PHONE_NUMBER_ID", "")
    cfg = get_whatsapp_config()
    client = WhatsAppCloudClient(cfg)
    assert client.configured is False
    assert await client.send_text(to_wa_id="7700111", body="hi") is False


@pytest.mark.asyncio
async def test_handle_inbound_sends_menu_reply(monkeypatch):
    monkeypatch.setenv("WHATSAPP_BOT_ENABLED", "true")
    cfg = get_whatsapp_config()
    inbound = extract_inbound_message(
        {
            "entry": [
                {
                    "changes": [
                        {
                            "value": {
                                "messages": [
                                    {
                                        "from": "77005556677",
                                        "id": "wamid.MENU1",
                                        "type": "text",
                                        "text": {"body": "меню"},
                                    }
                                ]
                            }
                        }
                    ]
                }
            ]
        }
    )
    assert inbound is not None
    cloud = MagicMock()
    cloud.send_text = AsyncMock(return_value=True)

    with patch(
        "services.whatsapp_ai_bot.handler.load_catalog",
        new=AsyncMock(return_value=_catalog()),
    ):
        await handle_inbound_message(MagicMock(), inbound, config=cfg, cloud_client=cloud)

    cloud.send_text.assert_awaited()
    args = cloud.send_text.await_args.kwargs
    assert args["to_wa_id"] == "77005556677"
    assert "категор" in args["body"].lower() or "Пицца" in args["body"]


@pytest.mark.asyncio
async def test_handle_inbound_skips_duplicate(monkeypatch):
    monkeypatch.setenv("WHATSAPP_BOT_ENABLED", "true")
    cfg = get_whatsapp_config()
    store = get_session_store(ttl_seconds=600)
    store.mark_seen("77005556677", "wamid.DUP")
    inbound = SimpleNamespace(
        event_kind="message",
        message_id="wamid.DUP",
        wa_id="77005556677",
        message_type="text",
        text="меню",
    )
    cloud = MagicMock()
    cloud.send_text = AsyncMock(return_value=True)
    await handle_inbound_message(MagicMock(), inbound, config=cfg, cloud_client=cloud)
    cloud.send_text.assert_not_awaited()


@pytest.mark.asyncio
async def test_http_post_acks_before_background(monkeypatch):
    """Enabled bot still returns 200 immediately; background is scheduled."""
    from httpx import ASGITransport, AsyncClient
    import hashlib
    import hmac
    import json

    from main import app

    secret = "stage2-secret"
    monkeypatch.setenv("WHATSAPP_APP_SECRET", secret)
    monkeypatch.setenv("WHATSAPP_BOT_ENABLED", "true")

    called = {"n": 0}

    async def _fake_bg(_payload):
        called["n"] += 1

    monkeypatch.setattr(
        "routers.whatsapp_webhook._process_inbound_background",
        _fake_bg,
    )

    payload = {
        "object": "whatsapp_business_account",
        "entry": [
            {
                "changes": [
                    {
                        "value": {
                            "messages": [
                                {
                                    "from": "77001112233",
                                    "id": "wamid.BG1",
                                    "type": "text",
                                    "text": {"body": "меню"},
                                }
                            ]
                        }
                    }
                ]
            }
        ],
    }
    body = json.dumps(payload).encode("utf-8")
    sig = "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/whatsapp/webhook",
            content=body,
            headers={"Content-Type": "application/json", "X-Hub-Signature-256": sig},
        )
    assert response.status_code == 200
    assert response.json().get("ok") is True
    # Give the event loop a tick for create_task
    import asyncio

    await asyncio.sleep(0.05)
    assert called["n"] == 1
