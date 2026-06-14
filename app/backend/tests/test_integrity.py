"""
Integration / integrity tests for Sortirovka24 API.

Run against production:
  set INTEGRITY_BASE_URL=https://sortirovka24-production-8788.up.railway.app
  cd app/backend && python -m pytest tests/test_integrity.py -v

Run against local server:
  set INTEGRITY_BASE_URL=http://127.0.0.1:8000
"""

from __future__ import annotations

import os

import httpx
import pytest

BASE_URL = os.getenv(
    "INTEGRITY_BASE_URL",
    "https://sortirovka24-production-8788.up.railway.app",
).rstrip("/")
TIMEOUT = float(os.getenv("INTEGRITY_TIMEOUT", "30"))


@pytest.fixture
def client():
    with httpx.Client(base_url=BASE_URL, timeout=TIMEOUT, follow_redirects=False) as c:
        yield c


class TestPublicHealth:
    def test_health(self, client: httpx.Client):
        r = client.get("/health")
        assert r.status_code == 200
        body = r.json()
        assert body.get("status") in {"ok", "healthy", True} or body.get("status") == "healthy"

    def test_spa_index(self, client: httpx.Client):
        r = client.get("/")
        assert r.status_code == 200
        assert "text/html" in r.headers.get("content-type", "")

    def test_account_google_status(self, client: httpx.Client):
        r = client.get("/api/v1/account/google/status")
        assert r.status_code == 200
        assert "enabled" in r.json()


class TestSecuritySurfaces:
    def test_debug_tables_blocked_on_prod(self, client: httpx.Client):
        r = client.get("/api/v1/debug/tables")
        assert r.status_code in {404, 403, 401}

    def test_unauthenticated_entity_delete_blocked(self, client: httpx.Client):
        r = client.delete("/api/v1/entities/news/999999")
        assert r.status_code in {401, 403, 404, 422}

    def test_unauthenticated_delivery_write_blocked(self, client: httpx.Client):
        r = client.post("/api/categories", json={"name": "integrity-test"})
        assert r.status_code in {401, 403, 422}

    def test_create_admin_not_public(self, client: httpx.Client):
        r = client.post("/api/v1/admin-auth/create-admin")
        assert r.status_code in {404, 401, 403, 400}


class TestPublicReads:
    def test_entities_news_list(self, client: httpx.Client):
        r = client.get("/api/v1/entities/news")
        assert r.status_code == 200

    def test_entities_announcements_list(self, client: httpx.Client):
        r = client.get("/api/v1/entities/announcements")
        assert r.status_code == 200

    def test_gastronom_catalog(self, client: httpx.Client):
        r = client.get("/api/v1/gastronom/catalog")
        assert r.status_code == 200

    def test_taxi_settings(self, client: httpx.Client):
        r = client.get("/api/v1/taxi/settings")
        assert r.status_code == 200

    def test_support_settings(self, client: httpx.Client):
        r = client.get("/api/v1/support/settings")
        if r.status_code == 404:
            pytest.skip("Support API not deployed yet (deploy backend with support router)")
        assert r.status_code == 200
        data = r.json()
        assert "recipient" in data
        assert "promo_enabled" in data


class TestAccountFlow:
    def test_register_sms_requires_phone(self, client: httpx.Client):
        r = client.post("/api/v1/account/register/request-sms", json={"phone": ""})
        assert r.status_code in {400, 422}

    def test_login_invalid_credentials(self, client: httpx.Client):
        r = client.post(
            "/api/v1/account/login",
            json={"phone": "+77000000000", "password": "wrong-password-xyz"},
        )
        assert r.status_code in {401, 429}

    def test_me_without_token(self, client: httpx.Client):
        r = client.get("/api/v1/account/me")
        assert r.status_code == 401
