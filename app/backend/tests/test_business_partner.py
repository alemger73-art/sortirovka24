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
            },
        )
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["success"] is True
    assert data.get("id")
