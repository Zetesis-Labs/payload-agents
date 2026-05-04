"""Discord channel loader: mounts our custom `DiscordInterface` per
`discord-installations` row and exports per-bot bind config so the
`IdentityBindMiddleware` can intercept `/connect <token>` slash commands.
"""

from __future__ import annotations

from typing import Any

import httpx
import structlog

from agno_agent_builder.channels.discord.interface import DISCORD_API_BASE, DiscordInterface
from agno_agent_builder.channels.discord.verification import verify_discord_signature
from agno_agent_builder.channels.fetch import fetch_installation_docs
from agno_agent_builder.channels.types import (
    BindExtraction,
    ChannelBinding,
    ChannelInstallation,
)
from agno_agent_builder.registry import AgentRegistry

logger = structlog.get_logger("agno_agent_builder.channels.discord.loader")

CHANNEL = "discord"
COLLECTION_SLUG = "discord-installations"


class DiscordChannelLoader:
    @property
    def channel(self) -> str:
        return CHANNEL

    async def fetch(self, payload_url: str, internal_secret: str) -> list[ChannelInstallation]:
        docs = await fetch_installation_docs(
            payload_url=payload_url,
            internal_secret=internal_secret,
            collection_slug=COLLECTION_SLUG,
        )
        out: list[ChannelInstallation] = []
        for doc in docs:
            try:
                out.append(_parse(doc))
            except (KeyError, TypeError, ValueError) as exc:
                logger.warning("Skipping malformed Discord installation", error=str(exc))
        return out

    async def mount(
        self, app: Any, registry: AgentRegistry, installations: list[ChannelInstallation]
    ) -> list[ChannelBinding]:
        bindings: list[ChannelBinding] = []
        for install in installations:
            agent = registry.get(install.agent_slug)
            if agent is None:
                logger.warning("Discord installation references missing agent", agent=install.agent_slug)
                continue
            application_id = install.extras["application_id"]
            public_key = install.extras["public_key"]
            bot_token = install.extras["bot_token"]
            prefix = f"/discord/{application_id}"

            interface = DiscordInterface(
                agent=agent,
                application_id=application_id,
                public_key=public_key,
                bot_token=bot_token,
                prefix=prefix,
            )
            app.include_router(interface.get_router())

            bindings.append(
                ChannelBinding(
                    channel=CHANNEL,
                    installation_id=install.id,
                    webhook_path=f"{prefix}/interactions",
                    extract_token=_make_discord_extractor(public_key=public_key),
                    reply=_make_discord_replier(application_id=application_id),
                    immediate_ack_body=b'{"type":5}',
                )
            )
            logger.info(
                "Mounted Discord interface",
                application_id=application_id,
                agent=install.agent_slug,
                prefix=prefix,
            )
        return bindings


def _parse(doc: dict[str, Any]) -> ChannelInstallation:
    application_id = doc.get("applicationId")
    public_key = doc.get("publicKey")
    bot_token = doc.get("botToken")
    if not isinstance(application_id, str) or not application_id:
        raise ValueError(f"installation {doc.get('id', '?')} has no applicationId")
    if not isinstance(public_key, str) or not public_key:
        raise ValueError(f"installation {application_id!r} has no publicKey")
    if not isinstance(bot_token, str) or not bot_token:
        raise ValueError(f"installation {application_id!r} has no botToken")

    agent = doc.get("agent")
    agent_slug = agent.get("slug") if isinstance(agent, dict) else None
    if not isinstance(agent_slug, str) or not agent_slug:
        raise ValueError(f"installation {application_id!r} has no agent.slug")

    tenant = doc.get("tenant")
    tenant_slug = tenant.get("slug") if isinstance(tenant, dict) else None

    return ChannelInstallation(
        channel=CHANNEL,
        id=doc["id"],
        agent_slug=agent_slug,
        tenant_slug=tenant_slug if isinstance(tenant_slug, str) else None,
        extras={
            "application_id": application_id,
            "public_key": public_key,
            "bot_token": bot_token,
        },
    )


def _make_discord_extractor(*, public_key: str) -> Any:
    """Verify Ed25519 against the per-installation public key, then parse the
    `/connect <token>` slash command payload. Bind closure captures the key
    so the middleware can use it without leaking installations across rows.
    """

    def extract(body: bytes, headers: Any, update: dict[str, Any]) -> BindExtraction | None:
        sig = headers.get("x-signature-ed25519") if hasattr(headers, "get") else None
        ts = headers.get("x-signature-timestamp") if hasattr(headers, "get") else None
        if not isinstance(sig, str) or not isinstance(ts, str):
            return None
        if not verify_discord_signature(public_key_hex=public_key, timestamp=ts, body=body, signature_hex=sig):
            return None
        return _parse_discord_token(update)

    return extract


def _parse_discord_token(update: dict[str, Any]) -> BindExtraction | None:
    """Discord `/connect <token>` slash command. Interaction shape:

      {type: 2, data: {name: "connect", options: [{name: "token", value: "..."}]},
       member: {user: {id, username}}, ...}
    """
    if update.get("type") != 2:
        return None
    data = update.get("data") or {}
    if data.get("name") != "connect":
        return None
    options = data.get("options") or []
    token: str | None = None
    for option in options:
        if option.get("name") == "token":
            value = option.get("value")
            if isinstance(value, str):
                token = value.strip()
                break
    if not token:
        return None

    user = (update.get("member") or {}).get("user") or update.get("user") or {}
    user_id = user.get("id")
    if not isinstance(user_id, str):
        return None

    return BindExtraction(
        token=token,
        external_id=user_id,
        external_username=user.get("username"),
        reply_target=update.get("token"),
    )


def _make_discord_replier(*, application_id: str) -> Any:
    async def reply(target: str | int, text: str) -> None:
        interaction_token = str(target)
        url = f"{DISCORD_API_BASE}/webhooks/{application_id}/{interaction_token}/messages/@original"
        async with httpx.AsyncClient(timeout=10.0) as client:
            try:
                await client.patch(url, json={"content": text[:2000]})
            except httpx.HTTPError:
                logger.exception("Failed to deliver Discord bind reply")

    return reply
