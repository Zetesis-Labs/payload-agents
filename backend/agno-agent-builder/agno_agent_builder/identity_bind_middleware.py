"""ASGI middleware that intercepts `connect <token>` style messages on any
registered channel webhook path and binds the channel identity to a CMS
user via `POST /api/identity-binding-tokens/bind`.

Runs BEFORE the inbound channel router (Telegram, WhatsApp, Discord) so it
can short-circuit the bind path without invoking the agent. Per-channel
extractors are registered by each `ChannelLoader.mount()` call and stored
on a shared mutable `IdentityBindState` populated in lifespan startup —
this lets the middleware register up-front before installations are known.

Each registered binding tells the middleware:
  * which webhook path to listen on
  * how to extract a token (channel-aware: includes signature validation
    where the agno interface doesn't run before us — Discord)
  * how to reply (channel-aware: Telegram/WhatsApp send via the channel's
    HTTP API; Discord PATCHes the interaction follow-up webhook)
  * what HTTP body to send back as the immediate ACK (Discord requires
    `{"type":5}` to defer the slash command response)
"""

from __future__ import annotations

import asyncio
import json
from collections.abc import Awaitable, Callable
from typing import Any

import httpx
import structlog

from agno_agent_builder.channels.types import BindExtraction, ChannelBinding

logger = structlog.get_logger("agno_agent_builder.identity_bind_middleware")

INTERNAL_SECRET_HEADER = "X-Internal-Secret"  # noqa: S105


class IdentityBindState:
    """Mutable holder populated by `app.py`'s lifespan once installations
    across all channels are mounted. Lets the middleware register at app
    construction (Starlette builds its stack before lifespan runs) and pick
    up live config later — every request before the state is populated
    falls through to the agent.
    """

    def __init__(self) -> None:
        self.bindings_by_path: dict[str, ChannelBinding] = {}

    def update(self, bindings: list[ChannelBinding]) -> None:
        self.bindings_by_path = {b.webhook_path: b for b in bindings}


class IdentityBindMiddleware:
    def __init__(
        self,
        app: Any,
        *,
        payload_url: str,
        internal_secret: str,
        state: IdentityBindState,
    ) -> None:
        self.app = app
        self._payload_url = payload_url.rstrip("/")
        self._internal_secret = internal_secret
        self._state = state
        self._background_tasks: set[asyncio.Task[None]] = set()

    async def __call__(
        self,
        scope: dict[str, Any],
        receive: Callable[[], Awaitable[dict[str, Any]]],
        send: Callable[[dict[str, Any]], Awaitable[None]],
    ) -> None:
        if scope["type"] != "http" or scope.get("method") != "POST":
            await self.app(scope, receive, send)
            return
        binding = self._state.bindings_by_path.get(scope["path"])
        if binding is None:
            await self.app(scope, receive, send)
            return

        body = await _read_body(receive)
        try:
            parsed = json.loads(body)
        except json.JSONDecodeError:
            await self.app(scope, _replay(body), send)
            return

        headers = _headers_dict(scope)
        try:
            extraction = binding.extract_token(body, headers, parsed)
        except Exception:
            logger.exception("Token extractor raised", channel=binding.channel)
            await self.app(scope, _replay(body), send)
            return
        if extraction is None:
            await self.app(scope, _replay(body), send)
            return

        await _respond(send, status=200, body=binding.immediate_ack_body)
        task = asyncio.create_task(self._bind_and_reply(binding=binding, extraction=extraction))
        self._background_tasks.add(task)
        task.add_done_callback(self._background_tasks.discard)

    async def _bind_and_reply(self, *, binding: ChannelBinding, extraction: BindExtraction) -> None:
        try:
            reply_text = await self._call_bind(binding=binding, extraction=extraction)
        except Exception:
            logger.exception("Identity bind call failed", channel=binding.channel)
            reply_text = "Something went wrong while linking your account. Please try again."

        target = (
            extraction.reply_target
            if extraction.reply_target is not None
            else extraction.external_id
        )
        try:
            await binding.reply(target, reply_text)
        except Exception:
            logger.exception("Channel reply failed", channel=binding.channel)

    async def _call_bind(self, *, binding: ChannelBinding, extraction: BindExtraction) -> str:
        url = f"{self._payload_url}/api/identity-binding-tokens/bind"
        payload: dict[str, Any] = {
            "token": extraction.token,
            "channel": binding.channel,
            "externalId": extraction.external_id,
            "installationId": binding.installation_id,
        }
        if extraction.external_username:
            payload["externalUsername"] = extraction.external_username

        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                url, headers={INTERNAL_SECRET_HEADER: self._internal_secret}, json=payload
            )

        if response.status_code == 200:
            user = response.json().get("user", {})
            display = user.get("email") or "your Zetesis account"
            return f"Connected to {display}. You can now chat with the agent."
        if response.status_code in (404, 410):
            return "This binding link is invalid or has expired. Generate a new one in /settings/integrations."
        if response.status_code == 403:
            return "This binding link doesn't match this installation. Generate a new one."
        if response.status_code == 409:
            return "This channel identity is already bound to a different Zetesis user."
        return "Sorry — couldn't link your account right now. Please try again in a minute."


async def _read_body(receive: Callable[[], Awaitable[dict[str, Any]]]) -> bytes:
    chunks: list[bytes] = []
    while True:
        message = await receive()
        if message["type"] != "http.request":
            break
        chunks.append(message.get("body", b""))
        if not message.get("more_body", False):
            break
    return b"".join(chunks)


def _replay(body: bytes) -> Callable[[], Awaitable[dict[str, Any]]]:
    sent = False

    async def receive() -> dict[str, Any]:
        nonlocal sent
        if sent:
            return {"type": "http.disconnect"}
        sent = True
        return {"type": "http.request", "body": body, "more_body": False}

    return receive


def _headers_dict(scope: dict[str, Any]) -> dict[str, str]:
    out: dict[str, str] = {}
    for raw_name, raw_value in scope.get("headers", []):
        try:
            out[raw_name.decode("latin-1").lower()] = raw_value.decode("latin-1")
        except (AttributeError, UnicodeDecodeError):
            continue
    return out


async def _respond(
    send: Callable[[dict[str, Any]], Awaitable[None]], *, status: int, body: bytes
) -> None:
    await send(
        {
            "type": "http.response.start",
            "status": status,
            "headers": [(b"content-type", b"application/json")],
        }
    )
    await send({"type": "http.response.body", "body": body, "more_body": False})
