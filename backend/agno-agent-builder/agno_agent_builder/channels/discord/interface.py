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
        {"name":"message","description":"Your message","type":3,"required":true}
      ]},
      {"name":"connect","description":"Link your Zetesis account","options":[
        {"name":"token","description":"Token from /settings/integrations","type":3,"required":true}
      ]}
    ]
"""

from __future__ import annotations

import asyncio
import json
from typing import Any

import httpx
import structlog
from agno.agent import Agent
from fastapi import APIRouter, BackgroundTasks, HTTPException, Request

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
        if not message_text:
            return {"type": 4, "data": {"content": "No message provided.", "flags": 64}}

        background_tasks.add_task(
            self._run_agent_and_followup, interaction=interaction, message=message_text
        )
        return {"type": 5}

    async def _run_agent_and_followup(self, *, interaction: dict[str, Any], message: str) -> None:
        token = interaction.get("token")
        if not isinstance(token, str):
            logger.error("Discord interaction missing token; cannot follow up")
            return
        try:
            response = await asyncio.wait_for(
                self._agent.arun(message), timeout=DISCORD_AGENT_RUN_TIMEOUT_S
            )
            content = _stringify_agent_response(response)
        except TimeoutError:
            logger.warning("Discord agent run exceeded 14m, follow-up will likely 404")
            content = "Took too long to respond — please try again."
        except Exception:
            logger.exception("Discord agent invocation failed")
            content = "Sorry, something went wrong while processing your message."

        url = f"{DISCORD_API_BASE}/webhooks/{self._application_id}/{token}/messages/@original"
        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                await client.patch(url, json={"content": content[:2000]})
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


def _stringify_agent_response(response: Any) -> str:
    content = getattr(response, "content", None)
    if isinstance(content, str) and content:
        return content
    return str(response)
