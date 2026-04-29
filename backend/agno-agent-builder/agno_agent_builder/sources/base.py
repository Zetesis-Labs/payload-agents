"""`AgentSource` protocol — the seam consumers swap to plug their own CMS."""

from __future__ import annotations

from typing import Protocol, runtime_checkable

from agno_agent_builder.sources.types import AgentConfig


@runtime_checkable
class AgentSource(Protocol):
    """Async interface that returns the active agents on each registry reload."""

    async def fetch_agents(self) -> list[AgentConfig]: ...
