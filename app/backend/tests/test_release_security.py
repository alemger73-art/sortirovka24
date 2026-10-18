"""Release 1.1 hardening: real visitor IP, security headers, Telegram flood limits."""
import pytest
from httpx import ASGITransport, AsyncClient
from core.client_ip import resolve, is_cloudflare


def test_cloudflare_visitor_ip_is_used_only_behind_cloudflare():
    # Railway appends the connecting address (a Cloudflare edge) as the last entry.
    assert resolve({'x-forwarded-for': '172.71.192.162', 'cf-connecting-ip': '193.41.130.227'}, '10.0.0.1') == '193.41.130.227'
    # A client forging CF-Connecting-IP while bypassing Cloudflare is ignored.
    assert resolve({'x-forwarded-for': '6.6.6.6, 203.0.113.9', 'cf-connecting-ip': '1.2.3.4'}, '10.0.0.1') == '203.0.113.9'
    # A forged leftmost entry never wins over the address Railway appended.
    assert resolve({'x-forwarded-for': '1.1.1.1, 198.51.100.7'}, '10.0.0.1') == '198.51.100.7'
    assert resolve({}, '127.0.0.1') == '127.0.0.1'
    assert is_cloudflare('172.71.192.162') and not is_cloudflare('193.41.130.227')


@pytest.fixture
async def client(monkeypatch):
    monkeypatch.setenv('DEBUG', '1')
    from main import app
    async with AsyncClient(transport=ASGITransport(app=app), base_url='http://test') as ac:
        yield ac


@pytest.mark.asyncio
async def test_security_headers_present(client):
    r = await client.get('/health')
    for name in ('strict-transport-security', 'x-content-type-options', 'x-frame-options', 'referrer-policy'):
        assert name in r.headers, name
    assert "frame-ancestors 'self'" in r.headers['content-security-policy']


@pytest.mark.asyncio
async def test_untrusted_railway_origin_is_not_allowed_by_cors(client):
    r = await client.options('/api/v1/modules', headers={'Origin': 'https://evil.up.railway.app', 'Access-Control-Request-Method': 'GET'})
    assert r.headers.get('access-control-allow-origin') != 'https://evil.up.railway.app'
    ok = await client.options('/api/v1/modules', headers={'Origin': 'https://www.sortirovka24.kz', 'Access-Control-Request-Method': 'GET'})
    assert ok.headers.get('access-control-allow-origin') == 'https://www.sortirovka24.kz'


@pytest.mark.asyncio
async def test_telegram_flood_is_limited_per_visitor(client, monkeypatch):
    monkeypatch.setattr('routers.telegram.notify_new_job', lambda data: _ok())
    body = {'job_title': 'Повар', 'phone': '+77000000000'}
    codes = [(await client.post('/api/v1/telegram/notify/job', json=body, headers={'X-Forwarded-For': '203.0.113.50'})).status_code for _ in range(12)]
    assert 429 in codes
    other = await client.post('/api/v1/telegram/notify/job', json=body, headers={'X-Forwarded-For': '203.0.113.51'})
    assert other.status_code != 429


async def _ok():
    return True


@pytest.mark.asyncio
async def test_telegram_test_message_requires_admin(client):
    assert (await client.post('/api/v1/telegram/test')).status_code in (401, 403)


@pytest.mark.asyncio
async def test_disabled_modules_are_not_in_sitemap_or_indexed(monkeypatch):
    import services.seo_renderer as seo
    async def disabled():
        return {'announcements', 'jobs', 'real_estate'}
    monkeypatch.setattr(seo, '_disabled_modules', disabled)
    xml = await seo.build_sitemap_xml()
    assert '/news<' in xml and '/announcements<' not in xml and '/jobs<' not in xml
    page = await seo.build_seo_page('/announcements')
    assert page.status_code == 404 and page.robots.startswith('noindex')
    home = await seo.build_seo_page('/')
    assert 'href="/jobs"' not in home.body and 'href="/news"' in home.body


def test_complaint_author_phone_is_hidden_from_public():
    from starlette.requests import Request
    from routers.complaints import _public_view
    public = Request({'type': 'http', 'headers': []})
    result = _public_view({'items': [{'id': 1, 'phone': '+77001234567', 'user_id': 'u1', 'description': 'Яма'}], 'total': 1, 'skip': 0, 'limit': 20}, public)
    assert result['items'][0]['phone'] is None and result['items'][0]['user_id'] is None
    assert result['items'][0]['description'] == 'Яма'


@pytest.mark.asyncio
async def test_customer_lists_are_not_public(client):
    for entity in ('park_orders', 'user_preferences', 'food_orders'):
        r = await client.get(f'/api/v1/entities/{entity}?limit=1')
        assert r.status_code in (401, 403), (entity, r.status_code)
