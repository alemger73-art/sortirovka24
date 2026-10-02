from starlette.requests import Request
from core.pwa_origin import canonical_web_redirect

def request(host, path='/', method='GET'):
    return Request({'type':'http', 'method':method, 'scheme':'https', 'server':(host,443), 'path':path,
        'query_string':b'source=pwa', 'headers':[(b'host',host.encode())]})

def test_legacy_web_origin_redirects_and_preserves_route():
    assert canonical_web_redirect(request('sortirovka24-production-8788.up.railway.app','/food')) == 'https://www.sortirovka24.kz/food?source=pwa'

def test_current_and_staging_origins_are_unchanged():
    for host in ['www.sortirovka24.kz','localhost','sortirovka24-staging-staging.up.railway.app']:
        assert canonical_web_redirect(request(host)) is None

def test_health_api_and_post_are_never_redirected():
    for path in ['/health','/api/v1/push/register-web']:
        assert canonical_web_redirect(request('sortirovka24-production-8788.up.railway.app',path)) is None
    assert canonical_web_redirect(request('sortirovka24-production-8788.up.railway.app','/food','POST')) is None
