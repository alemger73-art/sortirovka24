import pytest

from services import seo_renderer


@pytest.mark.asyncio
async def test_public_page_has_unique_indexable_metadata(monkeypatch):
    monkeypatch.setattr(seo_renderer.db_manager, "async_session_maker", None)
    page = await seo_renderer.build_seo_page("/food")

    assert page.status_code == 200
    assert page.robots.startswith("index")
    assert "DÄM ALEM" in page.title
    assert page.canonical == "https://www.sortirovka24.kz/food"


@pytest.mark.asyncio
async def test_private_and_unknown_pages_are_not_indexed(monkeypatch):
    monkeypatch.setattr(seo_renderer.db_manager, "async_session_maker", None)

    private_page = await seo_renderer.build_seo_page("/cabinet/orders/food/1")
    courier_page = await seo_renderer.build_seo_page("/dam-alem/courier")
    missing_page = await seo_renderer.build_seo_page("/definitely-missing")

    assert private_page.robots == "noindex, nofollow"
    assert courier_page.status_code == 200
    assert courier_page.robots == "noindex, nofollow"
    assert missing_page.status_code == 404
    assert missing_page.robots.startswith("noindex")


@pytest.mark.asyncio
async def test_public_forms_are_valid_but_not_indexed(monkeypatch):
    monkeypatch.setattr(seo_renderer.db_manager, "async_session_maker", None)

    complaint_form = await seo_renderer.build_seo_page("/complaints/new")
    food_park = await seo_renderer.build_seo_page("/food/park")
    malformed_detail = await seo_renderer.build_seo_page("/news/not-a-number")

    assert complaint_form.status_code == 200
    assert complaint_form.robots.startswith("noindex")
    assert food_park.status_code == 200
    assert food_park.robots.startswith("noindex")
    assert malformed_detail.status_code == 404


def test_html_renderer_replaces_metadata_and_adds_visible_content():
    template = """<html><head><title>Old</title>
    <meta name="description" content="old" /><meta name="robots" content="index" />
    <link rel="canonical" href="https://example.test/" />
    <meta property="og:title" content="old" /><meta property="og:description" content="old" />
    <meta property="og:type" content="website" /><meta property="og:url" content="https://example.test/" />
    <meta property="og:image" content="https://example.test/a.png" />
    <meta name="twitter:title" content="old" /><meta name="twitter:description" content="old" />
    <meta name="twitter:image" content="https://example.test/a.png" /></head>
    <body><div id="root"></div></body></html>"""
    page = seo_renderer.SeoPage(
        title="Новости Сортировки",
        description="Новости района",
        path="/news",
        heading="Новости",
        intro="Свежие события",
    )

    rendered = seo_renderer.render_html(template, page)

    assert "Новости Сортировки</title>" in rendered
    assert 'href="https://www.sortirovka24.kz/news"' in rendered
    assert '<main id="seo-prerender"' in rendered
    assert "application/ld+json" in rendered
