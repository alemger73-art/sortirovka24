"""Direct links used by app stores must return a real public page."""
import pytest
from services.seo_renderer import build_seo_page, render_html

@pytest.mark.asyncio
async def test_deletion_url_has_success_status_and_safe_public_metadata():
    page = await build_seo_page("/delete-account")
    assert page.status_code == 200
    assert page.canonical == "https://www.sortirovka24.kz/delete-account"
    document = render_html('<html><head><title>Old</title></head><body><div id="root"></div></body></html>', page)
    assert "Удаление аккаунта" in document
    assert "srt-group.24@mail.ru" in document

@pytest.mark.asyncio
async def test_unknown_public_url_still_returns_not_found():
    assert (await build_seo_page("/not-a-real-s24-route")).status_code == 404
