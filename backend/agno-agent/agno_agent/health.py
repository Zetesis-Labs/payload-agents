"""Kubernetes liveness + readiness probes.

- ``/health`` — liveness: process alive (always 200).
- ``/ready`` — readiness: returns 200 only if the agent registry has
  at least one agent loaded AND the database responds to a ping.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi import APIRouter, Depends, HTTPException

from agno_agent.db import check_db
from agno_agent.dependencies import get_registry
from agno_agent.schemas import HealthResponse, ReadyResponse

if TYPE_CHECKING:
    from agno_agent.registry import AgentRegistry

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(status="ok")


@router.get("/ready", response_model=ReadyResponse)
async def ready(registry: AgentRegistry = Depends(get_registry)) -> ReadyResponse:
    agents = registry.all()
    if not agents:
        raise HTTPException(status_code=503, detail="No agents loaded")

    db_ok = await check_db()
    if not db_ok:
        raise HTTPException(status_code=503, detail="Database unreachable")

    return ReadyResponse(status="ok", agents=len(agents))
