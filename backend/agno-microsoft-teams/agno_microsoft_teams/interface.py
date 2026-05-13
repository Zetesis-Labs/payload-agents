"""Custom Microsoft Teams interface (Bot Framework messaging endpoint).

agno doesn't ship a Teams interface, so we mount our own FastAPI router
that mirrors the agno-interface contract: one router per installation, all
routes under a customizable prefix, JWT validation handled inside the
router (so the K8s ingress can stay unauthenticated for /teams/*).

Activity types handled here:
  ``message``   — pass through to the agent and reply via the connector.
                  Bind-token messages (``bind <token>``) are short-circuited
                  by ``IdentityBindMiddleware`` before this router runs.
  ``invoke``    — Adaptive Card / messaging extension actions (not yet).
  ``conversationUpdate`` — ack only (member added/removed). Useful later
                  for greeting messages; today we just 200-OK.

Operator step (one-time per bot):
  Register the bot in Azure (Azure Bot resource), set its messaging
  endpoint to ``https://<runtime-host>/teams/<appId>/messages``, and
  publish a Teams app manifest declaring the bot. Customers sideload the
  manifest into their Teams tenant (admin upload) — single multi-tenant
  Entra app + single Azure Bot resource serves all customers.
"""

from __future__ import annotations

import asyncio
import json
from typing import Any, cast

import httpx
import msal
import structlog
from agno.agent import Agent, RemoteAgent
from agno.os.interfaces.base import BaseInterface
from agno.team import RemoteTeam, Team
from agno.workflow import RemoteWorkflow, Workflow
from fastapi import APIRouter, BackgroundTasks, HTTPException, Request, Response

from agno_microsoft_teams.attachments import download_attachments
from agno_microsoft_teams.outbound_media import build_attachments
from agno_microsoft_teams.verification import verify_teams_jwt

# Bot Framework auth tokens are short (1h). MSAL caches them in-memory; we
# build one client per installation so the cache is per-bot and we don't
# leak credentials across installations.

# Bot connector replies are time-sensitive: Teams shows "Bot is thinking..."
# until we POST back. Cap the agent run at 14m so a slow run produces an
# error follow-up rather than a hung conversation.
TEAMS_AGENT_RUN_TIMEOUT_S = 14 * 60

logger = structlog.get_logger("agno_microsoft_teams.interface")


def build_msal_client(
    *, app_id: str, app_password: str, tenant_id: str | None
) -> msal.ConfidentialClientApplication:
    """Single-tenant bots use ``https://login.microsoftonline.com/{tenantId}``;
    multi-tenant bots use the ``botframework.com`` authority. The Bot Connector
    accepts either as long as the audience is right.
    """
    authority = (
        f"https://login.microsoftonline.com/{tenant_id}"
        if tenant_id
        else "https://login.microsoftonline.com/botframework.com"
    )
    return msal.ConfidentialClientApplication(
        client_id=app_id,
        client_credential=app_password,
        authority=authority,
    )


async def acquire_bot_token(client: msal.ConfidentialClientApplication) -> str | None:
    loop = asyncio.get_running_loop()
    result = await loop.run_in_executor(
        None,
        lambda: client.acquire_token_for_client(scopes=["https://api.botframework.com/.default"]),
    )
    if "access_token" not in result:
        logger.error(
            "MSAL token acquisition failed",
            error=result.get("error"),
            description=result.get("error_description"),
        )
        return None
    return str(result["access_token"])


class Teams(BaseInterface):
    type = "teams"

    def __init__(
        self,
        *,
        agent: Agent | RemoteAgent | None = None,
        team: Team | RemoteTeam | None = None,
        workflow: Workflow | RemoteWorkflow | None = None,
        app_id: str,
        app_password: str,
        tenant_id: str | None = None,
        prefix: str | None = None,
        tags: list[str] | None = None,
    ) -> None:
        self.agent = agent
        self.team = team
        self.workflow = workflow
        self.prefix = prefix or f"/teams/{app_id}"
        self.tags = tags or ["Teams"]

        entity = agent or team or workflow
        if entity is None:
            raise ValueError("Teams requires an agent, team, or workflow")

        self._entity: Any = entity
        self._app_id = app_id
        self._tenant_id = tenant_id
        self._msal = build_msal_client(
            app_id=app_id, app_password=app_password, tenant_id=tenant_id
        )

    def get_router(self, use_async: bool = True, **kwargs: Any) -> APIRouter:
        router = APIRouter(prefix=self.prefix, tags=cast(Any, self.tags))

        @router.post("/messages", operation_id=f"teams_messages_{self._app_id}")
        async def messages(request: Request, background_tasks: BackgroundTasks) -> Response:
            body = await request.body()
            try:
                activity = json.loads(body.decode("utf-8"))
            except json.JSONDecodeError as exc:
                raise HTTPException(status_code=400, detail="Invalid JSON body") from exc

            service_url = activity.get("serviceUrl") if isinstance(activity, dict) else None
            claims = await verify_teams_jwt(
                authorization_header=request.headers.get("Authorization"),
                expected_app_id=self._app_id,
                body_service_url=service_url if isinstance(service_url, str) else None,
            )
            if claims is None:
                raise HTTPException(status_code=401, detail="Invalid bot framework token")

            activity_type = activity.get("type")
            if activity_type == "message":
                return self._handle_message(activity, background_tasks)
            if activity_type in ("conversationUpdate", "invoke", "messageReaction", "typing"):
                return Response(status_code=200)
            return Response(status_code=200)

        return router

    def _handle_message(
        self, activity: dict[str, Any], background_tasks: BackgroundTasks
    ) -> Response:
        text = activity.get("text")
        service_url = activity.get("serviceUrl")
        conversation = activity.get("conversation") or {}
        conversation_id = conversation.get("id")
        if not isinstance(service_url, str) or not isinstance(conversation_id, str):
            return Response(status_code=200)

        cleaned_text = _strip_bot_mention(text, activity) if isinstance(text, str) else ""
        raw_attachments = activity.get("attachments")
        attachments = raw_attachments if isinstance(raw_attachments, list) else []
        if not cleaned_text and not attachments:
            return Response(status_code=200)

        background_tasks.add_task(
            self._run_agent_and_reply,
            message=cleaned_text,
            attachments=attachments,
            service_url=service_url,
            conversation_id=conversation_id,
            reply_to_id=activity.get("id") if isinstance(activity.get("id"), str) else None,
            recipient=activity.get("from") or {},
            from_=activity.get("recipient") or {},
        )
        return Response(status_code=202)

    async def _run_agent_and_reply(
        self,
        *,
        message: str,
        attachments: list[dict[str, Any]],
        service_url: str,
        conversation_id: str,
        reply_to_id: str | None,
        recipient: dict[str, Any],
        from_: dict[str, Any],
    ) -> None:
        bot_token = await acquire_bot_token(self._msal) if attachments else None
        media_kwargs, skipped = await download_attachments(
            attachments=attachments, bot_token=bot_token
        )
        prompt = _prepend_skip_notice(message, skipped)
        if not prompt and not media_kwargs:
            # Pure attachments-only message where nothing could be downloaded.
            return

        outbound_attachments: list[dict[str, Any]] = []
        try:
            response = await asyncio.wait_for(
                self._entity.arun(prompt, **media_kwargs), timeout=TEAMS_AGENT_RUN_TIMEOUT_S
            )
            content = _stringify_agent_response(response)
            outbound_attachments = build_attachments(response)
        except TimeoutError:
            logger.warning("Teams agent run exceeded timeout, sending fallback")
            content = "Took too long to respond — please try again."
        except Exception:
            logger.exception("Teams agent invocation failed")
            content = "Sorry, something went wrong while processing your message."

        await self._send_reply(
            service_url=service_url,
            conversation_id=conversation_id,
            reply_to_id=reply_to_id,
            text=content,
            recipient=recipient,
            from_=from_,
            attachments=outbound_attachments,
        )

    async def _send_reply(
        self,
        *,
        service_url: str,
        conversation_id: str,
        reply_to_id: str | None,
        text: str,
        recipient: dict[str, Any],
        from_: dict[str, Any],
        attachments: list[dict[str, Any]] | None = None,
    ) -> None:
        token = await acquire_bot_token(self._msal)
        if token is None:
            return

        url = f"{service_url.rstrip('/')}/v3/conversations/{conversation_id}/activities"
        if reply_to_id:
            url = f"{url}/{reply_to_id}"
        payload: dict[str, Any] = {
            "type": "message",
            "from": from_,
            "recipient": recipient,
            "conversation": {"id": conversation_id},
            "text": text,
        }
        if reply_to_id:
            payload["replyToId"] = reply_to_id
        if attachments:
            payload["attachments"] = attachments

        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                await client.post(
                    url,
                    headers={"Authorization": f"Bearer {token}"},
                    json=payload,
                )
            except httpx.HTTPError:
                logger.exception("Failed to deliver Teams reply")


def _prepend_skip_notice(message: str, skipped: list[str]) -> str:
    """Mirror agno's WhatsApp pattern: when we can't download some media,
    prepend a one-line notice so the model and the user both know what was
    dropped instead of pretending nothing happened.
    """
    if not skipped:
        return message
    notice = "[Some attachments could not be downloaded: " + "; ".join(skipped) + "]"
    return f"{notice}\n\n{message}" if message else notice


def _strip_bot_mention(text: str, activity: dict[str, Any]) -> str:
    """Teams DMs deliver the message verbatim, but channel @mentions inline
    the bot's display name in the text and add an ``entities[].type=='mention'``
    block. Strip the substring covered by each bot-targeted mention so the
    agent receives just the user's intent.
    """
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


def _stringify_agent_response(response: Any) -> str:
    content = getattr(response, "content", None)
    if isinstance(content, str) and content:
        return content
    return str(response)


TeamsInterface = Teams
