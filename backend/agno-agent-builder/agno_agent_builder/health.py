"""Kubernetes liveness + readiness probes."""

from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi import APIRouter, Depends, HTTPException

from agno_agent_builder.dependencies import get_engine_holder, get_registry
from agno_agent_builder.schemas import HealthResponse, ReadyResponse

if TYPE_CHECKING:
    from agno_agent_builder.db import EngineHolder
    from agno_agent_builder.registry import AgentRegistry

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(status="ok")


@router.get("/ready", response_model=ReadyResponse)
async def ready(
    registry: AgentRegistry = Depends(get_registry),
    engine_holder: EngineHolder = Depends(get_engine_holder),
) -> ReadyResponse:
    agents = registry.all()
    if not agents:
        raise HTTPException(status_code=503, detail="No agents loaded")

    if not await engine_holder.check():
        raise HTTPException(status_code=503, detail="Database unreachable")

    return ReadyResponse(status="ok", agents=len(agents))
