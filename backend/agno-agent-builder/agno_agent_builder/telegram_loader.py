"""Loads Telegram bot installations from the host CMS and wires one
agno `Telegram` interface per installation onto the FastAPI app.

The host CMS (e.g. ZetesisPortal) exposes a tenant-aware collection of
TelegramBotInstallations and an internal endpoint that the runtime calls
at boot to enumerate them. Each installation pins a (bot, agent) pairing,
so the same agno-agent process can host many tenants' bots in parallel.

Webhook auth — agno's `validate_webhook_secret_token` reads a SINGLE env
var (`TELEGRAM_WEBHOOK_SECRET_TOKEN`), so for v1 every installation shares
the same webhook secret. Operators register each bot via Telegram's
`setWebhook` with `secret_token=<global>`. Per-bot rotation requires
upstream changes (tracked separately).
"""

from __future__ import annotations

from dataclasses import dataclass

import httpx
import structlog

from agno_agent_builder.registry import AgentRegistry

logger = structlog.get_logger("agno_agent_builder.telegram_loader")

INTERNAL_SECRET_HEADER = "X-Internal-Secret"  # noqa: S105


@dataclass(slots=True)
class TelegramInstallation:
    """Subset of the CMS row the runtime needs to mount one Telegram interface."""

    id: str | int
    bot_username: str
    bot_token: str
    agent_slug: str
    tenant_slug: str | None


async def fetch_installations(
    payload_url: str, internal_secret: str, timeout_s: float = 10.0
) -> list[TelegramInstallation]:
    """GET /api/telegram-bot-installations/internal/list."""
    if not internal_secret:
        logger.warning("Telegram loader skipped: internal_secret empty")
        return []

    url = f"{payload_url.rstrip('/')}/api/telegram-bot-installations/internal/list"
    async with httpx.AsyncClient(timeout=timeout_s) as client:
        try:
            response = await client.get(url, headers={INTERNAL_SECRET_HEADER: internal_secret})
        except httpx.HTTPError:
            logger.exception("Failed to fetch Telegram bot installations")
            return []

    if response.status_code == 404:
        # Host doesn't expose the endpoint — Telegram support not provisioned.
        return []
    if not response.is_success:
        logger.error(
            "Telegram bot installations endpoint returned non-2xx",
            status_code=response.status_code,
            body=response.text[:200],
        )
        return []

    docs = response.json().get("docs", [])
    installations: list[TelegramInstallation] = []
    for doc in docs:
        try:
            installations.append(_parse_installation(doc))
        except (KeyError, TypeError, ValueError) as exc:
            logger.warning("Skipping malformed Telegram bot installation", error=str(exc))
    return installations


def _parse_installation(doc: dict) -> TelegramInstallation:
    bot_username = doc.get("botUsername")
    bot_token = doc.get("botToken")
    if not isinstance(bot_username, str) or not bot_username:
        raise ValueError(f"installation {doc.get('id', '?')} has no botUsername")
    if not isinstance(bot_token, str) or not bot_token:
        raise ValueError(f"installation {bot_username!r} has no botToken")

    agent = doc.get("agent")
    agent_slug = agent.get("slug") if isinstance(agent, dict) else None
    if not isinstance(agent_slug, str) or not agent_slug:
        raise ValueError(f"installation {bot_username!r} has no agent.slug (depth=1 not honoured?)")

    tenant = doc.get("tenant")
    tenant_slug = tenant.get("slug") if isinstance(tenant, dict) else None

    return TelegramInstallation(
        id=doc["id"],
        bot_username=bot_username,
        bot_token=bot_token,
        agent_slug=agent_slug,
        tenant_slug=tenant_slug if isinstance(tenant_slug, str) else None,
    )


def mount_telegram_interfaces(
    app, registry: AgentRegistry, installations: list[TelegramInstallation]
) -> list[str]:
    """Build one agno `Telegram` interface per installation, mount its router.

    Returns the list of webhook paths registered, so the caller can extend
    `InternalAuthMiddleware`'s public_paths to allow Telegram to hit them
    directly (Telegram validates its own X-Telegram-Bot-Api-Secret-Token).
    """
    try:
        from agno.os.interfaces.telegram import Telegram
    except ImportError:
        logger.warning(
            "agno's Telegram interface not installed (install with `agno[telegram]`); "
            "Telegram bots will not be loaded"
        )
        return []

    registered_paths: list[str] = []
    for install in installations:
        agent = registry.get(install.agent_slug)
        if agent is None:
            logger.warning(
                "Bot installation references missing agent",
                bot=install.bot_username,
                agent_slug=install.agent_slug,
            )
            continue

        prefix = f"/telegram/{install.bot_username}"
        telegram = Telegram(
            agent=agent,
            token=install.bot_token,
            prefix=prefix,
            register_commands=False,  # handled out-of-process at install time
        )
        app.include_router(telegram.get_router())
        registered_paths.append(f"{prefix}/webhook")
        registered_paths.append(f"{prefix}/status")
        logger.info(
            "Mounted Telegram interface",
            bot=install.bot_username,
            agent=install.agent_slug,
            prefix=prefix,
        )

    return registered_paths
