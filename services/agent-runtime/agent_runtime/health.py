"""Kubernetes liveness + readiness probes.

- ``/health`` — liveness: process alive (always 200).
- ``/ready`` — readiness: returns 200 only if the agent registry has
  at least one agent loaded AND the database responds to a ping.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException

logger = logging.getLogger(__name__)

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/ready")
async def ready() -> dict[str, object]:
    # Import here to avoid circular imports (main → health → registry → main)
    from agent_runtime.main import registry
    from agent_runtime.registry import _check_db

    agents = registry.all()
    if not agents:
        raise HTTPException(status_code=503, detail="No agents loaded")

    db_ok = await _check_db()
    if not db_ok:
        raise HTTPException(status_code=503, detail="Database unreachable")

    return {"status": "ok", "agents": len(agents)}
