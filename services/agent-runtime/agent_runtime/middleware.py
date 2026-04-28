"""ASGI middlewares (pure ASGI — safe for SSE streaming).

- ``RequestIdMiddleware``: propagates ``X-Request-ID`` via contextvars.
- ``InternalAuthMiddleware``: validates ``X-Internal-Secret`` on all
  routes except health probes and docs.
- ``SessionMetadataMiddleware``: reads ``X-Tenant-Id`` on run requests
  and stashes ``{"tenant_id": ...}`` into ``request.state.metadata`` so
  Agno persists it into ``agno_sessions.metadata``.
"""

from __future__ import annotations

import hmac
import re
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


# Matches `POST /agents/{slug}/runs` — the only AgentOS endpoint that
# creates or updates an agno session row. Other endpoints don't touch
# `agno_sessions`, so metadata injection would be noise.
_RUNS_PATH_RE = re.compile(r"^/agents/[^/]+/runs/?$")


class SessionMetadataMiddleware:
    """Forward `X-Tenant-Id` from the portal into `request.state.metadata`.

    AgentOS's agent router lifts `request.state.metadata` and passes it to
    `agent.arun(metadata=...)`, which Agno persists into the session's
    `metadata` JSONB column. The portal reads that column back via
    `metadata->>'tenant_id'` to gate session ownership across tenants.

    Acts only on `POST /agents/{slug}/runs`; other requests are passed
    through untouched.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope.get("method") != "POST":
            await self.app(scope, receive, send)
            return

        path: str = scope.get("path", "")
        if not _RUNS_PATH_RE.match(path):
            await self.app(scope, receive, send)
            return

        tenant_id = _header(scope, b"x-tenant-id")
        if tenant_id:
            state = scope.setdefault("state", {})
            existing = state.get("metadata") or {}
            existing["tenant_id"] = tenant_id
            state["metadata"] = existing

        await self.app(scope, receive, send)


def _header(scope: Scope, name: bytes) -> str:
    for key, value in scope.get("headers", []):
        if key == name:
            return bytes(value).decode()
    return ""


async def _send_401(send: Send) -> None:
    await send(
        {
            "type": "http.response.start",
            "status": 401,
            "headers": [(b"content-type", b"application/json")],
        }
    )
    await send({"type": "http.response.body", "body": b'{"error":"Unauthorized"}'})
