"""FastAPI dependencies for dependency injection."""

from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi import Request

if TYPE_CHECKING:
    from agno_agent_builder.db import EngineHolder
    from agno_agent_builder.registry import AgentRegistry


async def get_registry(request: Request) -> AgentRegistry:
    return request.app.state.registry  # type: ignore[no-any-return]


async def get_engine_holder(request: Request) -> EngineHolder:
    return request.app.state.engine_holder  # type: ignore[no-any-return]
