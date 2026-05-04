"""Shared types for the channel loader framework.

A `ChannelLoader` knows how to (1) fetch its installations from the host
CMS, (2) mount one inbound interface per installation onto the FastAPI app,
and (3) produce per-installation `ChannelBinding`s that the
`IdentityBindMiddleware` uses to short-circuit `/connect <token>` style
messages and reply through the channel's API.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable, Mapping
from dataclasses import dataclass, field
from typing import Any, Protocol

from agno_agent_builder.registry import AgentRegistry


@dataclass(slots=True)
class ChannelInstallation:
    """Subset of a CMS installation row the runtime needs to mount an interface.

    Channel-specific extras live in `extras` so loaders stay typed without the
    base class growing every channel's fields.
    """

    channel: str
    id: str | int
    agent_slug: str
    tenant_slug: str | None
    extras: dict[str, Any]


@dataclass(slots=True)
class BindExtraction:
    """What a per-channel `extract_token` returns when an inbound message
    matches the binding pattern (Telegram `/start <token>`, WhatsApp
    `connect <token>`, Discord `/connect <token>`).
    """

    token: str
    external_id: str
    external_username: str | None = None
    """Channel-native chat id (Telegram chat_id, Discord channel_id, WhatsApp
    sender phone) used by the reply path. Optional because not every channel
    needs it (Telegram does, WhatsApp uses the phone twice)."""
    reply_target: str | int | None = None


ReplyCallback = Callable[[str | int, str], Awaitable[None]]
"""Async callable: given a channel-native target id and a text, deliver the
reply through that channel's API."""

TokenExtractor = Callable[[bytes, Mapping[str, str], dict[str, Any]], BindExtraction | None]
"""Per-channel signature-aware extractor. Receives the raw body, the request
headers, and the parsed JSON. Returns a BindExtraction if the message is a
binding attempt and the request signature is valid; otherwise None.

For Telegram and WhatsApp this currently ignores the headers (their signature
checks live in agno's interface and are env-var-based). For Discord the
extractor verifies the Ed25519 signature against the per-installation public
key — without this check the middleware would short-circuit unsigned slash
commands."""

DEFAULT_ACK_BODY = b'{"status":"ok"}'
"""HTTP 200 body the middleware sends when it short-circuits a webhook. The
default suits Telegram/WhatsApp (they ignore the body). Discord requires a
specific shape (`{"type":5}` for deferred response) and overrides this."""


@dataclass(slots=True)
class ChannelBinding:
    """Per-installation bind config the middleware reads when a request lands
    on `webhook_path`.
    """

    channel: str
    installation_id: str | int
    webhook_path: str
    extract_token: TokenExtractor
    reply: ReplyCallback
    immediate_ack_body: bytes = field(default=DEFAULT_ACK_BODY)


class ChannelLoader(Protocol):
    """Implementations live in `channels.<name>` and are registered in
    `app.py`'s lifespan if their channel is enabled.
    """

    @property
    def channel(self) -> str: ...

    async def fetch(self, payload_url: str, internal_secret: str) -> list[ChannelInstallation]: ...

    async def mount(
        self,
        app: Any,
        registry: AgentRegistry,
        installations: list[ChannelInstallation],
    ) -> list[ChannelBinding]: ...
