"""«Инструкции»: every guide is listed by the API and has its own page; unknown guides are 404."""
from pathlib import Path

from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from routers import instructions as router
from services import instructions
from services.seo_renderer import build_seo_page

PUBLIC = Path(__file__).resolve().parents[2] / "frontend" / "public"


async def test_list_comes_from_the_api():
    app = FastAPI()
    app.include_router(router.router)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        items = (await client.get("/api/v1/instructions")).json()["items"]
    assert items and items[0]["slug"] == "install-and-register"


def test_every_guide_has_its_video_and_poster_files_in_each_language():
    for guide in instructions.listing():
        for version in filter(None, (guide, guide.get("kz"))):
            assert version["title"] and version["steps"], guide["slug"]
            assert (PUBLIC / version["video"].lstrip("/")).is_file(), version["video"]
            assert (PUBLIC / version["poster"].lstrip("/")).is_file(), version["poster"]


async def test_guide_pages_have_title_picture_and_404():
    listing = await build_seo_page("/instructions")
    assert listing.status_code == 200 and "/instructions/install-and-register" in listing.body
    page = await build_seo_page("/instructions/install-and-register")
    assert page.status_code == 200 and page.title.startswith("Как установить") and page.image.endswith(".jpg")
    assert (await build_seo_page("/instructions/nothing")).status_code == 404
