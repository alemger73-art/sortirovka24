"""Retire the known public Railway web origin without redirecting API/health traffic."""
def canonical_web_redirect(request):
    if request.method not in ('GET', 'HEAD') or request.url.hostname != 'sortirovka24-production-8788.up.railway.app':
        return None
    if request.url.path.split('/', 2)[1] in ('api', 'health', 'docs', 'redoc', 'openapi.json'):
        return None
    return str(request.url.replace(scheme='https', netloc='www.sortirovka24.kz'))
