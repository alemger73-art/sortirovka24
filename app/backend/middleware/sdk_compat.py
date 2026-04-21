"""
SDK Compatibility Middleware

The Atoms Cloud SDK (@metagptx/web-sdk) wraps entity data in a `{ "data": { ... } }` 
envelope when calling create/update endpoints:

  SDK sends:  POST /api/v1/entities/news  { "data": { "title": "...", "content": "..." } }
  Router expects:  POST /api/v1/entities/news  { "title": "...", "content": "..." }

This ASGI middleware intercepts POST/PUT requests to /api/v1/entities/* and unwraps the 
`data` envelope so the existing Pydantic schemas work correctly.
"""

import json
import logging
from typing import Callable

logger = logging.getLogger(__name__)


class SDKCompatMiddleware:
    """Raw ASGI middleware to unwrap SDK's { data: { ... } } envelope for entity endpoints."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        method = scope.get("method", "")
        path = scope.get("path", "")

        # Only intercept POST/PUT to entity endpoints
        if method not in ("POST", "PUT") or "/api/v1/entities/" not in path:
            await self.app(scope, receive, send)
            return

        # Check content-type from headers
        headers = dict(scope.get("headers", []))
        content_type = headers.get(b"content-type", b"").decode("utf-8", errors="ignore")
        
        if "application/json" not in content_type:
            await self.app(scope, receive, send)
            return

        # Collect the full request body
        body_parts = []
        more_body = True

        async def collect_body():
            nonlocal more_body
            while more_body:
                message = await receive()
                body_parts.append(message.get("body", b""))
                more_body = message.get("more_body", False)

        await collect_body()
        full_body = b"".join(body_parts)

        if full_body:
            try:
                parsed = json.loads(full_body)
                
                # Check if body has a "data" key that contains the actual entity data
                if isinstance(parsed, dict) and "data" in parsed and isinstance(parsed["data"], dict):
                    unwrapped = parsed["data"]
                    logger.info(
                        f"SDK compat: unwrapped 'data' envelope for {method} {path} "
                        f"(keys: {list(unwrapped.keys())})"
                    )
                    full_body = json.dumps(unwrapped).encode("utf-8")
                    
                    # Update content-length header
                    new_headers = []
                    for key, value in scope.get("headers", []):
                        if key == b"content-length":
                            new_headers.append((b"content-length", str(len(full_body)).encode()))
                        else:
                            new_headers.append((key, value))
                    scope["headers"] = new_headers

            except json.JSONDecodeError:
                pass  # Not valid JSON, let the router handle the error
            except Exception as e:
                logger.warning(f"SDK compat middleware error: {e}")

        # Create a new receive that returns the (possibly modified) body
        body_sent = False

        async def new_receive():
            nonlocal body_sent
            if not body_sent:
                body_sent = True
                return {"type": "http.request", "body": full_body, "more_body": False}
            # After body is sent, wait for disconnect
            return await receive()

        await self.app(scope, new_receive, send)