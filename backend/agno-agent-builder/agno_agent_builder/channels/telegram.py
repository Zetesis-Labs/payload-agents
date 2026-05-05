"""Telegram channel loader: fetches `telegram-bot-installations` from the
host CMS, mounts one agno `Telegram` interface per row, and exports per-bot
bind config so the `IdentityBindMiddleware` can intercept `/start <token>`.
"""

from __future__ import annotations

import hmac
import os
from typing import Any

import httpx
import structlog

from agno_agent_builder.channels.fetch import fetch_installation_docs
from agno_agent_builder.channels.types import (
    BindExtraction,
    ChannelBinding,
    ChannelInstallation,
)
from agno_agent_builder.registry import AgentRegistry

logger = structlog.get_logger("agno_agent_builder.channels.telegram")

CHANNEL = "telegram"
COLLECTION_SLUG = "telegram-bot-installations"
TELEGRAM_API_BASE = "https://api.telegram.org"


class TelegramChannelLoader:
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
                logger.warning("Skipping malformed Telegram installation", error=str(exc))
        return out

    async def mount(
        self, app: Any, registry: AgentRegistry, installations: list[ChannelInstallation]
    ) -> list[ChannelBinding]:
        try:
            from agno.os.interfaces.telegram import Telegram
        except ImportError:
            logger.warning("agno[telegram] not installed; Telegram bots will not be loaded")
            return []

        bindings: list[ChannelBinding] = []
        for install in installations:
            agent = registry.get(install.agent_slug)
            if agent is None:
                logger.warning("Telegram installation references missing agent", agent=install.agent_slug)
                continue
            bot_username = install.extras["bot_username"]
            bot_token = install.extras["bot_token"]
            prefix = f"/telegram/{bot_username}"
            telegram = Telegram(
                agent=agent,
                token=bot_token,
                prefix=prefix,
                register_commands=False,
            )
            app.include_router(telegram.get_router())

            bindings.append(
                ChannelBinding(
                    channel=CHANNEL,
                    installation_id=install.id,
                    webhook_path=f"{prefix}/webhook",
                    extract_token=_extract_telegram_token,
                    reply=_make_telegram_replier(bot_token),
                )
            )
            logger.info(
                "Mounted Telegram interface",
                bot=bot_username,
                agent=install.agent_slug,
                prefix=prefix,
            )
        return bindings


def _parse(doc: dict[str, Any]) -> ChannelInstallation:
    bot_username = doc.get("botUsername")
    bot_token = doc.get("botToken")
    if not isinstance(bot_username, str) or not bot_username:
        raise ValueError(f"installation {doc.get('id', '?')} has no botUsername")
    if not isinstance(bot_token, str) or not bot_token:
        raise ValueError(f"installation {bot_username!r} has no botToken")

    agent = doc.get("agent")
    agent_slug = agent.get("slug") if isinstance(agent, dict) else None
    if not isinstance(agent_slug, str) or not agent_slug:
        raise ValueError(f"installation {bot_username!r} has no agent.slug")

    tenant = doc.get("tenant")
    tenant_slug = tenant.get("slug") if isinstance(tenant, dict) else None

    return ChannelInstallation(
        channel=CHANNEL,
        id=doc["id"],
        agent_slug=agent_slug,
        tenant_slug=tenant_slug if isinstance(tenant_slug, str) else None,
        extras={"bot_username": bot_username, "bot_token": bot_token},
    )


def _verify_telegram_secret(headers: Any) -> bool:
    """Validate Telegram's `X-Telegram-Bot-Api-Secret-Token` against the
    global `TELEGRAM_WEBHOOK_SECRET_TOKEN` env var. agno's Telegram
    interface does this on the passthrough path but the bind middleware
    short-circuits before agno runs, so the same check has to live here
    or a leaked binding token + the public webhook URL could be exploited.
    Dev mode (APP_ENV=development) bypasses, mirroring agno's behaviour.
    """
    if os.getenv("APP_ENV", "").lower() == "development":
        return True
    expected = os.getenv("TELEGRAM_WEBHOOK_SECRET_TOKEN")
    if not expected:
        return False
    received = headers.get("x-telegram-bot-api-secret-token") if hasattr(headers, "get") else None
    if not isinstance(received, str):
        return False
    return hmac.compare_digest(received, expected)


def _extract_telegram_token(_body: bytes, headers: Any, update: dict[str, Any]) -> BindExtraction | None:
    if not _verify_telegram_secret(headers):
        return None
    message = update.get("message") or {}
    text = message.get("text")
    if not isinstance(text, str):
        return None
    parts = text.strip().split(maxsplit=1)
    if len(parts) != 2:
        return None
    cmd = parts[0].split("@")[0]
    if cmd != "/start":
        return None
    token = parts[1].strip()
    if not token:
        return None
    from_user = message.get("from") or {}
    chat = message.get("chat") or {}
    chat_id = chat.get("id")
    user_id = from_user.get("id")
    if chat_id is None or user_id is None:
        return None
    return BindExtraction(
        token=token,
        external_id=str(user_id),
        external_username=from_user.get("username"),
        reply_target=chat_id,
    )


def _make_telegram_replier(bot_token: str) -> Any:
    async def reply(target: str | int, text: str) -> None:
        url = f"{TELEGRAM_API_BASE}/bot{bot_token}/sendMessage"
        async with httpx.AsyncClient(timeout=10.0) as client:
            try:
                await client.post(url, json={"chat_id": target, "text": text})
            except httpx.HTTPError:
                logger.exception("Failed to send Telegram bind reply")

    return reply
