"""AG-UI multi-agent endpoint.

Exposes ``POST /agents/{slug}/agui`` accepting a standard AG-UI
``RunAgentInput`` body and streaming back the AG-UI event protocol.

The stock ``agno.os.interfaces.agui.AGUI`` interface is per-agent (one
router per agent). This runtime is multi-tenant and reloads agents at
runtime via Postgres NOTIFY, so we need a single mount point that looks
the agent up by slug on each request.

Authentication is handled by ``InternalAuthMiddleware`` upstream — every
request must carry the shared ``X-Internal-Secret``. The portal's BFF
applies user-level access control before forwarding here.
"""

from __future__ import annotations

from collections.abc import AsyncIterator

from ag_ui.core import EventType, RunAgentInput, RunErrorEvent
from ag_ui.encoder import EventEncoder
from agno.os.interfaces.agui.router import run_agent
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from agno_agent_builder.dependencies import get_registry
from agno_agent_builder.logging import get_logger
from agno_agent_builder.registry import AgentRegistry

logger = get_logger(__name__)


def build_agui_router() -> APIRouter:
    router = APIRouter(tags=["agui"])
    encoder = EventEncoder()

    @router.post("/agents/{slug}/agui")
    async def run_agent_agui(
        slug: str,
        run_input: RunAgentInput,
        registry: AgentRegistry = Depends(get_registry),
    ) -> StreamingResponse:
        agent = registry.get(slug)
        if agent is None:
            raise HTTPException(status_code=404, detail=f"Agent '{slug}' not found")

        async def generate() -> AsyncIterator[str]:
            try:
                async for event in run_agent(agent, run_input):
                    yield encoder.encode(event)
            except Exception as exc:
                logger.exception("AG-UI run failed", slug=slug, thread_id=run_input.thread_id)
                yield encoder.encode(
                    RunErrorEvent(type=EventType.RUN_ERROR, message=str(exc))
                )

        return StreamingResponse(
            generate(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache, no-transform",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    return router
