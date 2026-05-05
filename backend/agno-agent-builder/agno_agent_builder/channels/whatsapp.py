"""WhatsApp channel loader: mounts one agno `Whatsapp` interface per
`whatsapp-installations` row. Inbound webhook signature uses the global
`WHATSAPP_APP_SECRET` env var (agno's interface only reads from env);
per-tenant `appSecret` storage exists in the schema for v2 and is ignored
here.

Bind flow: WhatsApp doesn't carry a `start` parameter on click-to-chat
links, so the user-facing flow is `wa.me/<phone>?text=connect%20<token>`.
The middleware extracts the leading `connect <token>` from the inbound
text payload and short-circuits.
"""

from __future__ import annotations

import hashlib
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

logger = structlog.get_logger("agno_agent_builder.channels.whatsapp")

CHANNEL = "whatsapp"
COLLECTION_SLUG = "whatsapp-installations"
WHATSAPP_GRAPH_BASE = "https://graph.facebook.com/v22.0"


class WhatsAppChannelLoader:
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
                logger.warning("Skipping malformed WhatsApp installation", error=str(exc))
        return out

    async def mount(
        self, app: Any, registry: AgentRegistry, installations: list[ChannelInstallation]
    ) -> list[ChannelBinding]:
        try:
            from agno.os.interfaces.whatsapp import Whatsapp
        except ImportError:
            logger.warning(
                "agno's WhatsApp interface not available; WhatsApp bots will not be loaded"
            )
            return []

        bindings: list[ChannelBinding] = []
        for install in installations:
            agent = registry.get(install.agent_slug)
            if agent is None:
                logger.warning(
                    "WhatsApp installation references missing agent", agent=install.agent_slug
                )
                continue
            phone_id = install.extras["phone_number_id"]
            access_token = install.extras["access_token"]
            verify_token = install.extras.get("verify_token")
            prefix = f"/whatsapp/{phone_id}"

            whatsapp = Whatsapp(
                agent=agent,
                prefix=prefix,
                access_token=access_token,
                phone_number_id=phone_id,
                verify_token=verify_token,
            )
            app.include_router(whatsapp.get_router())

            bindings.append(
                ChannelBinding(
                    channel=CHANNEL,
                    installation_id=install.id,
                    webhook_path=f"{prefix}/webhook",
                    extract_token=_extract_whatsapp_token,
                    reply=_make_whatsapp_replier(phone_id=phone_id, access_token=access_token),
                )
            )
            logger.info(
                "Mounted WhatsApp interface",
                phone_number_id=phone_id,
                agent=install.agent_slug,
                prefix=prefix,
            )
        return bindings


def _parse(doc: dict[str, Any]) -> ChannelInstallation:
    phone_number_id = doc.get("phoneNumberId")
    access_token = doc.get("accessToken")
    if not isinstance(phone_number_id, str) or not phone_number_id:
        raise ValueError(f"installation {doc.get('id', '?')} has no phoneNumberId")
    if not isinstance(access_token, str) or not access_token:
        raise ValueError(f"installation {phone_number_id!r} has no accessToken")

    agent = doc.get("agent")
    agent_slug = agent.get("slug") if isinstance(agent, dict) else None
    if not isinstance(agent_slug, str) or not agent_slug:
        raise ValueError(f"installation {phone_number_id!r} has no agent.slug")

    tenant = doc.get("tenant")
    tenant_slug = tenant.get("slug") if isinstance(tenant, dict) else None

    verify_token = doc.get("verifyToken") if isinstance(doc.get("verifyToken"), str) else None

    return ChannelInstallation(
        channel=CHANNEL,
        id=doc["id"],
        agent_slug=agent_slug,
        tenant_slug=tenant_slug if isinstance(tenant_slug, str) else None,
        extras={
            "phone_number_id": phone_number_id,
            "access_token": access_token,
            "verify_token": verify_token,
            "display_phone_number": doc.get("displayPhoneNumber"),
        },
    )


def _verify_whatsapp_signature(body: bytes, header: str | None) -> bool:
    """Validate Meta's `X-Hub-Signature-256` against `WHATSAPP_APP_SECRET`.

    Mirrors agno's own check (which only runs on the passthrough router, not
    on the bind middleware short-circuit). Without this, an attacker who
    knows the public webhook URL and a leaked `connect <token>` value could
    forge a `from` phone and bind any token to an arbitrary phone.

    The `WHATSAPP_SKIP_SIGNATURE_VALIDATION=true` escape hatch matches
    agno's local-dev behaviour.
    """
    if os.getenv("WHATSAPP_SKIP_SIGNATURE_VALIDATION", "").lower() == "true":
        return True
    secret = os.getenv("WHATSAPP_APP_SECRET")
    if not secret:
        return False
    if not header or not header.startswith("sha256="):
        return False
    expected = header.removeprefix("sha256=")
    digest = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(digest, expected)


def _extract_whatsapp_token(
    body: bytes, headers: Any, update: dict[str, Any]
) -> BindExtraction | None:
    """Walk Meta's webhook payload looking for the first text message that
    starts with `connect <token>`. Verifies the request signature first so
    a forged POST cannot bind arbitrary phones to leaked tokens.

    Inbound webhook shape (simplified):
      {entry: [{changes: [{value: {messages: [{from, text: {body}}]}}]}]}
    """
    sig_header = headers.get("x-hub-signature-256") if hasattr(headers, "get") else None
    if not _verify_whatsapp_signature(body, sig_header):
        return None
    entries = update.get("entry") or []
    for entry in entries:
        changes = entry.get("changes") or []
        for change in changes:
            value = change.get("value") or {}
            messages = value.get("messages") or []
            for message in messages:
                text = (message.get("text") or {}).get("body")
                if not isinstance(text, str):
                    continue
                parts = text.strip().split(maxsplit=1)
                if len(parts) != 2 or parts[0].lower() != "connect":
                    continue
                token = parts[1].strip()
                if not token:
                    continue
                from_phone = message.get("from")
                if not isinstance(from_phone, str) or not from_phone:
                    continue
                return BindExtraction(
                    token=token,
                    external_id=from_phone,
                    external_username=None,
                    reply_target=from_phone,
                )
    return None


def _make_whatsapp_replier(*, phone_id: str, access_token: str) -> Any:
    async def reply(target: str | int, text: str) -> None:
        url = f"{WHATSAPP_GRAPH_BASE}/{phone_id}/messages"
        body = {
            "messaging_product": "whatsapp",
            "to": str(target),
            "type": "text",
            "text": {"body": text},
        }
        async with httpx.AsyncClient(timeout=10.0) as client:
            try:
                await client.post(
                    url,
                    headers={"Authorization": f"Bearer {access_token}"},
                    json=body,
                )
            except httpx.HTTPError:
                logger.exception("Failed to send WhatsApp bind reply")

    return reply
