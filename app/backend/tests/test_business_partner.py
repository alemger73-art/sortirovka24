import pytest
from httpx import ASGITransport, AsyncClient

from main import app


@pytest.mark.asyncio
async def test_business_apply_creates_request():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/business/apply",
            json={
                "name": "Test Partner",
                "phone": "+77001234567",
                "activity": "food",
                "description": "pytest",
                "consent": True,
            },
        )
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["success"] is True
    assert data.get("id")


@pytest.mark.asyncio
async def test_partner_crm_stage_note_and_next_contact():
    from core.auth import create_access_token
    admin = {"Authorization": "Bearer " + create_access_token({"sub": "admin:crm", "role": "admin", "username": "crm-test"})}
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        created = await client.post("/api/v1/business/apply", json={
            "name": "CRM Partner", "phone": "+77001230099", "activity": "Салон красоты", "consent": True})
        lead_id = created.json()["id"]
        r = await client.patch(f"/api/v1/business/admin/requests/{lead_id}", headers=admin, json={"status": "negotiation"})
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "negotiation"
        r = await client.post(f"/api/v1/business/admin/requests/{lead_id}/notes", headers=admin, json={"text": "Позвонить после обеда"})
        assert r.status_code == 200, r.text
        r = await client.post(f"/api/v1/business/admin/requests/{lead_id}/next-contact", headers=admin, json={"at": "2026-10-21"})
        assert r.status_code == 200, r.text
        bad = await client.post(f"/api/v1/business/admin/requests/{lead_id}/next-contact", headers=admin, json={"at": "завтра"})
        assert bad.status_code == 400
        listing = (await client.get("/api/v1/business/admin/requests?status=negotiation", headers=admin)).json()
        item = next(i for i in listing["items"] if i["id"] == lead_id)
        assert item["next_contact"] == "2026-10-21" and item["last_note"] == "Позвонить после обеда"
        timeline = (await client.get(f"/api/v1/business/admin/requests/{lead_id}/timeline", headers=admin)).json()
        kinds = [t["kind"] for t in timeline]
        assert kinds[0] == "partner_lead_next_contact" and "partner_lead_status" in kinds and kinds[-1] == "partner_lead_created"
        assert (await client.get(f"/api/v1/business/admin/requests/{lead_id}/timeline")).status_code == 401
