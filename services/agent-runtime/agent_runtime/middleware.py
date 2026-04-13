"""Request correlation ID middleware (pure ASGI — safe for SSE streaming)."""

from __future__ import annotations

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
