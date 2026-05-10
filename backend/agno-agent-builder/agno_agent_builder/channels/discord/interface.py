"""Custom Discord interface (HTTP Interactions endpoint).

agno doesn't ship a Discord interface, so we mount our own FastAPI router
that mirrors the agno-interface contract: one router per installation, all
routes under a customizable prefix, signature validation handled inside the
router (so the K8s ingress can stay unauthenticated for /discord/*).

Slash commands handled here:
  /chat <message>    — defer (response type 5) and follow up with the
                       agent's reply via the interaction webhook.
  /connect <token>   — handled by IdentityBindMiddleware (short-circuits
                       this route before we see it). If we DO see it, it
                       means the middleware isn't registered correctly —
                       respond with a polite error instead of silently
                       running the agent on the bind token.

Operator step (one-time per bot):
  Register the slash commands via the Discord REST API:
    PUT /applications/{appId}/commands
    body: [
      {"name":"chat","description":"Talk to the agent","options":[
        {"name":"message","description":"Your message","type":3,"required":true},
        {"name":"file","description":"Optional file (image/PDF/etc.) for the agent","type":11,"required":false}
      ]},
      {"name":"connect","description":"Link your Zetesis account","options":[
        {"name":"token","description":"Token from /settings/integrations","type":3,"required":true}
      ]}
    ]

  Type 11 = ATTACHMENT. Discord delivers it via
  ``interaction.data.resolved.attachments[<id>]`` with a public CDN
  ``url`` (no auth) so we pass it as ``Image(url=...)`` / ``File(url=...)``
  to agno without downloading first.
"""

from __future__ import annotations

import asyncio
import json
from typing import Any

import httpx
import structlog
from agno.agent import Agent
from agno.media import Audio, File, Image, Video
from fastapi import APIRouter, BackgroundTasks, HTTPException, Request

from agno_agent_builder.channels.discord.outbound_media import collect_outbound
from agno_agent_builder.channels.discord.verification import verify_discord_signature

# Discord interaction tokens are valid for 15 minutes. Cap arun() below that
# so a slow agent run results in a clean error follow-up instead of the
# silent "Bot is thinking..." that lingers when the token has expired and
# the PATCH @original 404s.
DISCORD_AGENT_RUN_TIMEOUT_S = 14 * 60

logger = structlog.get_logger("agno_agent_builder.channels.discord.interface")

DISCORD_API_BASE = "https://discord.com/api/v10"


class DiscordInterface:
    type = "discord"

    def __init__(
        self,
        *,
        agent: Agent,
        application_id: str,
        public_key: str,
        bot_token: str,
        prefix: str,
    ) -> None:
        self._agent = agent
        self._application_id = application_id
        self._public_key = public_key
        self._bot_token = bot_token
        self._prefix = prefix

    def get_router(self) -> APIRouter:
        router = APIRouter(prefix=self._prefix, tags=["Discord"])

        @router.post("/interactions", operation_id=f"discord_interactions_{self._application_id}")
        async def interactions(
            request: Request, background_tasks: BackgroundTasks
        ) -> dict[str, Any]:
            body = await request.body()
            sig = request.headers.get("X-Signature-Ed25519")
            ts = request.headers.get("X-Signature-Timestamp")
            if not sig or not ts:
                raise HTTPException(status_code=401, detail="Missing signature headers")
            if not verify_discord_signature(
                public_key_hex=self._public_key,
                timestamp=ts,
                body=body,
                signature_hex=sig,
            ):
                raise HTTPException(status_code=401, detail="Invalid signature")

            try:
                interaction = json.loads(body.decode("utf-8"))
            except json.JSONDecodeError as exc:
                raise HTTPException(status_code=400, detail="Invalid JSON body") from exc

            interaction_type = interaction.get("type")
            if interaction_type == 1:
                return {"type": 1}

            if interaction_type == 2:
                return await self._handle_application_command(interaction, background_tasks)

            return {"type": 4, "data": {"content": "Interaction type not supported."}}

        return router

    async def _handle_application_command(
        self, interaction: dict[str, Any], background_tasks: BackgroundTasks
    ) -> dict[str, Any]:
        data = interaction.get("data") or {}
        name = data.get("name")
        if name == "chat":
            return self._handle_chat_command(interaction, background_tasks)
        if name == "connect":
            return {
                "type": 4,
                "data": {
                    "content": (
                        "Binding flow is not active. Make sure your runtime has the IdentityBindMiddleware enabled."
                    ),
                    "flags": 64,
                },
            }
        return {"type": 4, "data": {"content": f"Unknown command: {name}", "flags": 64}}

    def _handle_chat_command(
        self, interaction: dict[str, Any], background_tasks: BackgroundTasks
    ) -> dict[str, Any]:
        message_text = _option_value(interaction, "message")
        media_kwargs = _resolve_attachments(interaction)
        if not message_text and not media_kwargs:
            return {"type": 4, "data": {"content": "No message provided.", "flags": 64}}

        background_tasks.add_task(
            self._run_agent_and_followup,
            interaction=interaction,
            message=message_text or "",
            media_kwargs=media_kwargs,
        )
        return {"type": 5}

    async def _run_agent_and_followup(
        self,
        *,
        interaction: dict[str, Any],
        message: str,
        media_kwargs: dict[str, Any],
    ) -> None:
        token = interaction.get("token")
        if not isinstance(token, str):
            logger.error("Discord interaction missing token; cannot follow up")
            return
        files: list[tuple[str, bytes, str]] = []
        url_suffixes: list[str] = []
        try:
            response = await asyncio.wait_for(
                self._agent.arun(message, **media_kwargs), timeout=DISCORD_AGENT_RUN_TIMEOUT_S
            )
            content = _stringify_agent_response(response)
            files, url_suffixes = collect_outbound(response)
        except TimeoutError:
            logger.warning("Discord agent run exceeded 14m, follow-up will likely 404")
            content = "Took too long to respond — please try again."
        except Exception:
            logger.exception("Discord agent invocation failed")
            content = "Sorry, something went wrong while processing your message."

        if url_suffixes:
            content = "\n".join([content, *url_suffixes]) if content else "\n".join(url_suffixes)

        await self._patch_followup(token=token, content=content[:2000], files=files)

    async def _patch_followup(
        self,
        *,
        token: str,
        content: str,
        files: list[tuple[str, bytes, str]],
    ) -> None:
        url = f"{DISCORD_API_BASE}/webhooks/{self._application_id}/{token}/messages/@original"
        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                if files:
                    await client.patch(
                        url,
                        data={"payload_json": json.dumps({"content": content})},
                        files=[
                            (f"files[{i}]", (name, raw, mime))
                            for i, (name, raw, mime) in enumerate(files)
                        ],
                    )
                else:
                    await client.patch(url, json={"content": content})
            except httpx.HTTPError:
                logger.exception("Failed to deliver Discord follow-up message")


def _option_value(interaction: dict[str, Any], name: str) -> str | None:
    options = (interaction.get("data") or {}).get("options") or []
    for opt in options:
        if opt.get("name") == name:
            value = opt.get("value")
            if isinstance(value, str):
                return value
    return None


def _resolve_attachments(interaction: dict[str, Any]) -> dict[str, Any]:
    """Discord delivers attachment-typed slash command options as IDs;
    the actual ``url`` + ``content_type`` live under ``data.resolved.attachments``.

    We don't download — Discord's CDN URLs are public and signed, so passing
    ``url=`` lets agno fetch lazily when the model is invoked.
    """
    data = interaction.get("data") or {}
    options = data.get("options") or []
    resolved = (data.get("resolved") or {}).get("attachments") or {}
    if not isinstance(options, list) or not isinstance(resolved, dict):
        return {}

    attachment_ids: list[str] = []
    for opt in options:
        if isinstance(opt, dict) and opt.get("type") == 11:
            attachment_id = opt.get("value")
            if isinstance(attachment_id, str):
                attachment_ids.append(attachment_id)
    if not attachment_ids:
        return {}

    images: list[Image] = []
    audio: list[Audio] = []
    videos: list[Video] = []
    files: list[File] = []
    for attachment_id in attachment_ids:
        attachment = resolved.get(attachment_id)
        if not isinstance(attachment, dict):
            continue
        url = attachment.get("url")
        if not isinstance(url, str) or not url:
            continue
        content_type = attachment.get("content_type")
        filename = attachment.get("filename") if isinstance(attachment.get("filename"), str) else None
        if isinstance(content_type, str) and content_type.startswith("image/"):
            images.append(Image(url=url, mime_type=content_type))
        elif isinstance(content_type, str) and content_type.startswith("audio/"):
            audio.append(Audio(url=url, mime_type=content_type))
        elif isinstance(content_type, str) and content_type.startswith("video/"):
            videos.append(Video(url=url, mime_type=content_type))
        else:
            valid_mime = (
                content_type
                if isinstance(content_type, str) and content_type in File.valid_mime_types()
                else None
            )
            files.append(File(url=url, mime_type=valid_mime, filename=filename, name=filename))

    out: dict[str, Any] = {}
    if images:
        out["images"] = images
    if audio:
        out["audio"] = audio
    if videos:
        out["videos"] = videos
    if files:
        out["files"] = files
    return out


def _stringify_agent_response(response: Any) -> str:
    content = getattr(response, "content", None)
    if isinstance(content, str) and content:
        return content
    return str(response)
