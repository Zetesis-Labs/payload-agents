"""ASGI middlewares (pure ASGI — safe for SSE streaming).

- ``RequestIdMiddleware``: propagates ``X-Request-ID`` via contextvars.
- ``InternalAuthMiddleware``: validates ``X-Internal-Secret`` on all
  routes except health probes and docs.
"""

from __future__ import annotations

import hmac
import uuid
from contextvars import ContextVar

from starlette.types import ASGIApp, Message, Receive, Scope, Send

request_id_var: ContextVar[str] = ContextVar("request_id", default="")


class RequestIdMiddleware:
    """Extracts or generates X-Request-ID and propagates it via contextvars.

    Implemented as a raw ASGI middleware so streaming responses (SSE) are
    forwarded frame-by-frame instead of being buffered.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] not in ("http", "websocket"):
            await self.app(scope, receive, send)
            return

        headers = dict(scope.get("headers", []))
        rid = headers.get(b"x-request-id", b"").decode() or str(uuid.uuid4())
        request_id_var.set(rid)

        async def send_with_rid(message: Message) -> None:
            if message["type"] == "http.response.start":
                response_headers: list[tuple[bytes, bytes]] = list(message.get("headers", []))
                response_headers.append((b"x-request-id", rid.encode()))
                message["headers"] = response_headers
            await send(message)

        await self.app(scope, receive, send_with_rid)


# Paths that must remain unauthenticated (health probes, OpenAPI docs).
_PUBLIC_PATHS = frozenset({"/health", "/ready", "/docs", "/openapi.json"})


class InternalAuthMiddleware:
    """Reject requests without a valid ``X-Internal-Secret`` header.

    Health and docs endpoints are excluded so that Kubernetes probes
    and Swagger UI keep working without credentials.
    """

    def __init__(self, app: ASGIApp, *, secret: str) -> None:
        self.app = app
        self._secret = secret

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path: str = scope.get("path", "")
        if path in _PUBLIC_PATHS:
            await self.app(scope, receive, send)
            return

        headers = dict(scope.get("headers", []))
        token = headers.get(b"x-internal-secret", b"").decode()

        if not hmac.compare_digest(token, self._secret):
            await _send_401(send)
            return

        await self.app(scope, receive, send)


async def _send_401(send: Send) -> None:
    await send(
        {
            "type": "http.response.start",
            "status": 401,
            "headers": [(b"content-type", b"application/json")],
        }
    )
    await send({"type": "http.response.body", "body": b'{"error":"Unauthorized"}'})
