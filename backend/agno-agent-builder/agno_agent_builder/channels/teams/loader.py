"""Teams channel loader: mounts our custom :class:`TeamsInterface` per
``teams-bot-installations`` row and exports per-bot bind config so the
``IdentityBindMiddleware`` can intercept ``bind <token>`` messages.

Bind UX in Teams: a user types ``bind <token>`` (DM) or ``@bot bind <token>``
(channel). The middleware short-circuits before the agent runs, calls
``/api/identity-binding-tokens/bind``, and replies through the Bot
Connector. Reply target is encoded as ``"<serviceUrl>|<conversationId>"``
because Teams replies need both.

JWKS for inbound JWT validation is primed once at mount time so the
synchronous middleware extractor can verify without async I/O. The route
handler re-validates with on-miss refresh, so a recently-rotated key still
produces correct 401s on the message path even before the next prime.
"""

from __future__ import annotations

from typing import Any

import httpx
import structlog
from agno_microsoft_teams import (
    TeamsInterface,
    acquire_bot_token,
    build_msal_client,
    prime_jwks_cache,
    verify_teams_jwt_sync,
)

from agno_agent_builder.channels.fetch import fetch_installation_docs
from agno_agent_builder.channels.types import (
    BindExtraction,
    ChannelBinding,
    ChannelInstallation,
)
from agno_agent_builder.registry import AgentRegistry

logger = structlog.get_logger("agno_agent_builder.channels.teams.loader")

CHANNEL = "teams"
COLLECTION_SLUG = "teams-bot-installations"
REPLY_TARGET_SEPARATOR = "|"


class TeamsChannelLoader:
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
                logger.warning("Skipping malformed Teams installation", error=str(exc))
        return out

    async def mount(
        self, app: Any, registry: AgentRegistry, installations: list[ChannelInstallation]
    ) -> list[ChannelBinding]:
        if installations:
            try:
                await prime_jwks_cache()
            except Exception:
                logger.exception(
                    "Failed to prime Teams JWKS cache; bind path will reject all messages until next refresh"
                )

        bindings: list[ChannelBinding] = []
        for install in installations:
            agent = registry.get(install.agent_slug)
            if agent is None:
                logger.warning(
                    "Teams installation references missing agent", agent=install.agent_slug
                )
                continue
            app_id: str = install.extras["app_id"]
            app_password: str = install.extras["app_password"]
            tenant_id: str | None = install.extras.get("tenant_id")
            prefix = f"/teams/{app_id}"

            interface = TeamsInterface(
                agent=agent,
                app_id=app_id,
                app_password=app_password,
                tenant_id=tenant_id,
                prefix=prefix,
            )
            app.include_router(interface.get_router())

            bindings.append(
                ChannelBinding(
                    channel=CHANNEL,
                    installation_id=install.id,
                    webhook_path=f"{prefix}/messages",
                    extract_token=_make_teams_extractor(app_id=app_id),
                    reply=_make_teams_replier(
                        app_id=app_id, app_password=app_password, tenant_id=tenant_id
                    ),
                )
            )
            logger.info(
                "Mounted Teams interface",
                app_id=app_id,
                agent=install.agent_slug,
                prefix=prefix,
            )
        return bindings


def _parse(doc: dict[str, Any]) -> ChannelInstallation:
    app_id = doc.get("appId")
    app_password = doc.get("appPassword")
    if not isinstance(app_id, str) or not app_id:
        raise ValueError(f"installation {doc.get('id', '?')} has no appId")
    if not isinstance(app_password, str) or not app_password:
        raise ValueError(f"installation {app_id!r} has no appPassword")

    agent = doc.get("agent")
    agent_slug = agent.get("slug") if isinstance(agent, dict) else None
    if not isinstance(agent_slug, str) or not agent_slug:
        raise ValueError(f"installation {app_id!r} has no agent.slug")

    tenant = doc.get("tenant")
    tenant_slug = tenant.get("slug") if isinstance(tenant, dict) else None

    # Field renamed from `tenantId` → `aadTenantId` in the collection
    # because Payload's multi-tenant plugin already serialises its
    # `tenant` relationship as `tenant_id` in SQL, and a camelCase
    # `tenantId` text field collided with that on insert.
    raw_tenant_id = doc.get("aadTenantId")
    aad_tenant_id = raw_tenant_id if isinstance(raw_tenant_id, str) and raw_tenant_id else None

    return ChannelInstallation(
        channel=CHANNEL,
        id=doc["id"],
        agent_slug=agent_slug,
        tenant_slug=tenant_slug if isinstance(tenant_slug, str) else None,
        extras={
            "app_id": app_id,
            "app_password": app_password,
            "tenant_id": aad_tenant_id,
        },
    )


def _make_teams_extractor(*, app_id: str) -> Any:
    """Validate the Bot Framework JWT against the primed JWKS cache, then
    look for a ``bind <token>`` message — case-insensitive, optional
    @mention prefix stripped. Bind closure captures ``app_id`` so each
    installation only accepts tokens whose JWT audience matches its bot.
    """

    def extract(body: bytes, headers: Any, update: dict[str, Any]) -> BindExtraction | None:
        if not isinstance(update, dict) or update.get("type") != "message":
            return None

        service_url = update.get("serviceUrl")
        if not isinstance(service_url, str) or not service_url:
            return None

        auth_header = headers.get("authorization") if hasattr(headers, "get") else None
        claims = verify_teams_jwt_sync(
            authorization_header=auth_header,
            expected_app_id=app_id,
            body_service_url=service_url,
        )
        if claims is None:
            return None

        text = update.get("text")
        if not isinstance(text, str):
            return None

        cleaned = _strip_text_mentions(text, update)
        token = _parse_bind_command(cleaned)
        if token is None:
            return None

        from_user = update.get("from") or {}
        aad_object_id = from_user.get("aadObjectId")
        if not isinstance(aad_object_id, str) or not aad_object_id:
            return None

        conversation = update.get("conversation") or {}
        conversation_id = conversation.get("id")
        if not isinstance(conversation_id, str):
            return None

        reply_target = f"{service_url}{REPLY_TARGET_SEPARATOR}{conversation_id}"

        return BindExtraction(
            token=token,
            external_id=aad_object_id,
            external_username=from_user.get("name")
            if isinstance(from_user.get("name"), str)
            else None,
            reply_target=reply_target,
        )

    return extract


def _strip_text_mentions(text: str, activity: dict[str, Any]) -> str:
    cleaned = text
    entities = activity.get("entities") or []
    if not isinstance(entities, list):
        return cleaned.strip()
    for entity in entities:
        if not isinstance(entity, dict) or entity.get("type") != "mention":
            continue
        mention_text = entity.get("text")
        if isinstance(mention_text, str) and mention_text:
            cleaned = cleaned.replace(mention_text, "", 1)
    return cleaned.strip()


def _parse_bind_command(text: str) -> str | None:
    parts = text.strip().split(maxsplit=1)
    if len(parts) != 2:
        return None
    if parts[0].lower() != "bind":
        return None
    token = parts[1].strip()
    return token or None


def _make_teams_replier(*, app_id: str, app_password: str, tenant_id: str | None) -> Any:
    msal_client = build_msal_client(app_id=app_id, app_password=app_password, tenant_id=tenant_id)

    async def reply(target: str | int, text: str) -> None:
        if not isinstance(target, str) or REPLY_TARGET_SEPARATOR not in target:
            logger.error("Teams reply target malformed; expected serviceUrl|conversationId")
            return
        service_url, conversation_id = target.split(REPLY_TARGET_SEPARATOR, 1)
        token = await acquire_bot_token(msal_client)
        if token is None:
            return

        url = f"{service_url.rstrip('/')}/v3/conversations/{conversation_id}/activities"
        async with httpx.AsyncClient(timeout=10.0) as client:
            try:
                await client.post(
                    url,
                    headers={"Authorization": f"Bearer {token}"},
                    json={
                        "type": "message",
                        "conversation": {"id": conversation_id},
                        "text": text,
                    },
                )
            except httpx.HTTPError:
                logger.exception("Failed to send Teams bind reply")

    return reply
