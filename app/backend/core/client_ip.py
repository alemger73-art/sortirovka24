"""Resolve the real visitor IP behind Railway's edge and Cloudflare.

Production traffic arrives as: visitor -> Cloudflare -> Railway edge -> app.
uvicorn (``--forwarded-allow-ips=*``) takes the *leftmost* X-Forwarded-For entry,
which is either client-controlled or a Cloudflare edge address shared by many
visitors. Per-IP limits (PIN, SMS, forms) were therefore shared between
everyone behind one Cloudflare node.

Rule used here:
* the rightmost X-Forwarded-For entry is the address that connected to
  Railway's edge (appended by Railway, cannot be forged by the client);
* only when that address belongs to Cloudflare is ``CF-Connecting-IP`` trusted.

The middleware rewrites ``scope["client"]`` once, so every ``request.client.host``
in the application uses the resolved address.
"""
from __future__ import annotations

import ipaddress
from functools import lru_cache

# https://www.cloudflare.com/ips/ (stable published ranges)
_CLOUDFLARE_RANGES = (
    "173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22", "103.31.4.0/22",
    "141.101.64.0/18", "108.162.192.0/18", "190.93.240.0/20", "188.114.96.0/20",
    "197.234.240.0/22", "198.41.128.0/17", "162.158.0.0/15", "104.16.0.0/13",
    "104.24.0.0/14", "172.64.0.0/13", "131.0.72.0/22",
    "2400:cb00::/32", "2606:4700::/32", "2803:f800::/32", "2405:b500::/32",
    "2405:8100::/32", "2a06:98c0::/29", "2c0f:f248::/32",
)
_NETWORKS = tuple(ipaddress.ip_network(n) for n in _CLOUDFLARE_RANGES)


def _parse(value: str | None):
    if not value:
        return None
    value = value.strip().strip('"')
    if value.startswith('[') and ']' in value:
        value = value[1:value.index(']')]
    elif value.count(':') == 1:  # IPv4 with port
        value = value.split(':', 1)[0]
    try:
        return ipaddress.ip_address(value)
    except ValueError:
        return None


@lru_cache(maxsize=4096)
def is_cloudflare(address: str) -> bool:
    ip = _parse(address)
    return bool(ip) and any(ip in network for network in _NETWORKS)


def resolve(headers: dict[str, str], fallback: str | None) -> str | None:
    forwarded = [part for part in (headers.get('x-forwarded-for') or '').split(',') if part.strip()]
    peer = _parse(forwarded[-1]) if forwarded else _parse(fallback)
    peer_text = str(peer) if peer else fallback
    if peer_text and is_cloudflare(peer_text):
        visitor = _parse(headers.get('cf-connecting-ip'))
        if visitor:
            return str(visitor)
    return peer_text


class RealClientIPMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope.get('type') in ('http', 'websocket'):
            headers = {}
            for name, value in scope.get('headers') or ():
                key = name.decode('latin1').lower()
                if key in ('x-forwarded-for', 'cf-connecting-ip'):
                    text = value.decode('latin1')
                    headers[key] = f"{headers[key]}, {text}" if key in headers else text
            client = scope.get('client')
            host = resolve(headers, client[0] if client else None)
            if host:
                scope = dict(scope)
                scope['client'] = (host, client[1] if client else 0)
        await self.app(scope, receive, send)
