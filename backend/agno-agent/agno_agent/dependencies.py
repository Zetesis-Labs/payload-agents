"""FastAPI dependencies for dependency injection."""

from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi import Request

if TYPE_CHECKING:
    from agno_agent.registry import AgentRegistry


async def get_registry(request: Request) -> AgentRegistry:
    """Inject the agent registry from app.state."""
    return request.app.state.registry  # type: ignore[no-any-return]
