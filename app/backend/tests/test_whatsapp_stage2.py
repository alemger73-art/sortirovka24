"""WhatsApp bot stage 2: sessions, catalog replies, Cloud API, fast webhook ACK."""

from __future__ import annotations

import hashlib
import hmac
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from httpx import ASGITransport, AsyncClient

from main import app
from services.whatsapp_ai_bot.catalog import (
    CatalogCategory,
    CatalogItem,
    CatalogSnapshot,
    find_category,
    format_price,
    search_items,
)
from services.whatsapp_ai_bot.cloud_api import WhatsAppCloudClient
from services.whatsapp_ai_bot.commands import parse_intent
from services.whatsapp_ai_bot.config import WhatsAppBotConfig, get_whatsapp_config
from services.whatsapp_ai_bot.handler import build_reply_text, handle_inbound_message
from services.whatsapp_ai_bot.ingress import extract_inbound_message
from services.whatsapp_ai_bot.session_store import (
    get_session_store,
    reset_session_store_for_tests,
)


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture(autouse=True)
def _reset_sessions():
    reset_session_store_for_tests()
    yield
    reset_session_store_for_tests()


def _sign(body: bytes, secret: str) -> str:
    digest = hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
    return f"sha256={digest}"


def _sample_catalog() -> CatalogSnapshot:
    return CatalogSnapshot(
        restaurant_id=1,
        brand="DAM ALEM",
        categories=(
            CatalogCategory(id=10, name="Пицца", slug="pizza"),
            CatalogCategory(id=11, name="Шашлык", slug="shashlik"),
        ),
        items=(
            CatalogItem(id=1, name="Маргарита", price=2500, category_id=10),
            CatalogItem(id=2, name="Пепперони", price=3200, category_id=10),
            CatalogItem(id=3, name="Шашлык из баранины", price=4500, category_id=11),
        ),
    )


SAMPLE_MESSAGE_PAYLOAD = {
    "object": "whatsapp_business_account",
    "entry": [
        {
            "id": "WABA_ID",
            "changes": [
                {
                    "field": "messages",
                    "value": {
                        "messaging_product": "whatsapp",
                        "metadata": {
                            "display_phone_number": "77001234567",
                            "phone_number_id": "PHONE_ID",
                        },
                        "contacts": [
                            {
                                "profile": {"name": "Test User"},
                                "wa_id": "77009876543",
                            }
                        ],
                        "messages": [
                            {
                                "from": "77009876543",
                                "id": "wamid.STAGE2_MENU_001",
                                "timestamp": "1710000000",
                                "type": "text",
                                "text": {"body": "меню"},
                            }
                        ],
                    },
                }
            ],
        }
    ],
}


# ---------- parse_intent ----------


def test_parse_intent_menu():
    assert parse_intent("меню").name == "menu"
    assert parse_intent("Menu").name == "menu"


def test_parse_intent_help():
    assert parse_intent("помощь").name == "help"
    assert parse_intent("help").name == "help"


def test_parse_intent_category():
    intent = parse_intent("категория пицца")
    assert intent.name == "category"
    assert intent.query.lower() == "пицца"


def test_parse_intent_search():
    intent = parse_intent("найди шашлык")
    assert intent.name == "search"
    assert "шашлык" in intent.query.lower()


def test_parse_intent_lookup():
    intent = parse_intent("Маргарита")
    assert intent.name == "lookup"
    assert intent.query == "Маргарита"


# ---------- catalog helpers ----------


def test_find_category_and_search_items():
    catalog = _sample_catalog()
    cat = find_category(catalog, "пицца")
    assert cat is not None
    assert cat.id == 10
    hits = search_items(catalog, "марг")
    assert len(hits) == 1
    assert hits[0].name == "Маргарита"
    assert "₸" in format_price(2500)


# ---------- build_reply ----------


def test_build_reply_menu_and_category():
    catalog = _sample_catalog()
    menu_text = build_reply_text(parse_intent("меню"), catalog)
    assert "Пицца" in menu_text
    assert "Шашлык" in menu_text

    cat_text = build_reply_text(parse_intent("категория пицца"), catalog)
    assert "Маргарита" in cat_text
    assert "Пепперони" in cat_text
    assert "Шашлык из баранины" not in cat_text


# ---------- session dedupe ----------


def test_session_dedupe():
    store = get_session_store(ttl_seconds=60)
    assert store.mark_seen("77001112233", "wamid.A") is True
    assert store.mark_seen("77001112233", "wamid.A") is False
    assert store.mark_seen("77001112233", "wamid.B") is True
    session = store.get_or_create("77001112233")
    assert "wamid.A" in session.seen_message_ids


# ---------- extract_inbound_message ----------


def test_extract_inbound_message_text():
    inbound = extract_inbound_message(SAMPLE_MESSAGE_PAYLOAD)
    assert inbound is not None
    assert inbound.event_kind == "message"
    assert inbound.message_id == "wamid.STAGE2_MENU_001"
    assert inbound.wa_id == "77009876543"
    assert inbound.message_type == "text"
    assert inbound.text == "меню"


def test_extract_inbound_button_and_interactive():
    button_payload = {
        "object": "whatsapp_business_account",
        "entry": [
            {
                "changes": [
                    {
                        "value": {
                            "messages": [
                                {
                                    "from": "77001230000",
                                    "id": "wamid.BTN",
                                    "type": "button",
                                    "button": {"text": "помощь", "payload": "HELP"},
                                }
                            ]
                        }
                    }
                ]
            }
        ],
    }
    inbound = extract_inbound_message(button_payload)
    assert inbound is not None
    assert inbound.text == "помощь"

    interactive_payload = {
        "object": "whatsapp_business_account",
        "entry": [
            {
                "changes": [
                    {
                        "value": {
                            "messages": [
                                {
                                    "from": "77001230000",
                                    "id": "wamid.INT",
                                    "type": "interactive",
                                    "interactive": {
                                        "type": "list_reply",
                                        "list_reply": {
                                            "id": "cat_pizza",
                                            "title": "Пицца",
                                        },
                                    },
                                }
                            ]
                        }
                    }
                ]
            }
        ],
    }
    inbound2 = extract_inbound_message(interactive_payload)
    assert inbound2 is not None
    assert inbound2.text == "Пицца"


# ---------- cloud client ----------


@pytest.mark.asyncio
async def test_cloud_client_skips_without_creds(monkeypatch):
    monkeypatch.delenv("WHATSAPP_ACCESS_TOKEN", raising=False)
    monkeypatch.delenv("WHATSAPP_PHONE_NUMBER_ID", raising=False)
    cfg = WhatsAppBotConfig(
        enabled=True,
        verify_token="",
        app_secret="",
        access_token="",
        phone_number_id="",
        business_account_id="",
        api_version="v21.0",
        graph_base_url="https://graph.facebook.com",
        session_ttl_seconds=3600,
    )
    client = WhatsAppCloudClient(cfg)
    assert await client.send_text("77001112233", "hello") is False


# ---------- handle_inbound_message ----------


@pytest.mark.asyncio
async def test_handle_inbound_sends_menu(monkeypatch):
    cfg = WhatsAppBotConfig(
        enabled=True,
        verify_token="t",
        app_secret="s",
        access_token="token",
        phone_number_id="phone",
        business_account_id="",
        api_version="v21.0",
        graph_base_url="https://graph.facebook.com",
        session_ttl_seconds=3600,
    )
    catalog = _sample_catalog()
    monkeypatch.setattr(
        "services.whatsapp_ai_bot.handler.load_catalog",
        AsyncMock(return_value=catalog),
    )
    cloud = SimpleNamespace(send_text=AsyncMock(return_value=True))
    inbound = extract_inbound_message(SAMPLE_MESSAGE_PAYLOAD)
    assert inbound is not None

    await handle_inbound_message(
        db=SimpleNamespace(),
        inbound=inbound,
        config=cfg,
        cloud_client=cloud,
    )
    cloud.send_text.assert_awaited_once()
    to_wa, body = cloud.send_text.await_args.args
    assert to_wa == "77009876543"
    assert "Пицца" in body
    assert "Шашлык" in body


@pytest.mark.asyncio
async def test_handle_duplicate_skip(monkeypatch):
    cfg = WhatsAppBotConfig(
        enabled=True,
        verify_token="t",
        app_secret="s",
        access_token="token",
        phone_number_id="phone",
        business_account_id="",
        api_version="v21.0",
        graph_base_url="https://graph.facebook.com",
        session_ttl_seconds=3600,
    )
    monkeypatch.setattr(
        "services.whatsapp_ai_bot.handler.load_catalog",
        AsyncMock(return_value=_sample_catalog()),
    )
    cloud = SimpleNamespace(send_text=AsyncMock(return_value=True))
    inbound = extract_inbound_message(SAMPLE_MESSAGE_PAYLOAD)
    assert inbound is not None

    await handle_inbound_message(
        db=SimpleNamespace(),
        inbound=inbound,
        config=cfg,
        cloud_client=cloud,
    )
    await handle_inbound_message(
        db=SimpleNamespace(),
        inbound=inbound,
        config=cfg,
        cloud_client=cloud,
    )
    assert cloud.send_text.await_count == 1


# ---------- HTTP: ack + schedule background ----------


@pytest.mark.asyncio
async def test_http_post_acks_and_schedules_background(client: AsyncClient, monkeypatch):
    secret = "test-app-secret"
    monkeypatch.setenv("WHATSAPP_APP_SECRET", secret)
    monkeypatch.setenv("WHATSAPP_BOT_ENABLED", "true")

    called = {"n": 0}

    async def _track(payload):
        called["n"] += 1
        assert payload["object"] == "whatsapp_business_account"

    monkeypatch.setattr(
        "routers.whatsapp_webhook._process_inbound_background",
        _track,
    )

    body = json.dumps(SAMPLE_MESSAGE_PAYLOAD).encode("utf-8")
    response = await client.post(
        "/api/v1/whatsapp/webhook",
        content=body,
        headers={
            "Content-Type": "application/json",
            "X-Hub-Signature-256": _sign(body, secret),
        },
    )
    assert response.status_code == 200
    assert response.json().get("ok") is True
    # Give the event loop a tick so create_task can run.
    import asyncio

    await asyncio.sleep(0)
    assert called["n"] == 1


def test_config_stage2_fields(monkeypatch):
    monkeypatch.delenv("WHATSAPP_BOT_ENABLED", raising=False)
    monkeypatch.delenv("WHATSAPP_GRAPH_BASE_URL", raising=False)
    monkeypatch.delenv("WHATSAPP_SESSION_TTL_SECONDS", raising=False)
    cfg = get_whatsapp_config()
    assert cfg.enabled is False
    assert cfg.graph_base_url == "https://graph.facebook.com"
    assert cfg.session_ttl_seconds == 3600
