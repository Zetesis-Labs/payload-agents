"""Pluggable agent configuration sources.

`AgentSource` is the protocol consumers implement to plug their CMS or
configuration store into the runtime. `PayloadAgentSource` is the default
implementation for Payload CMS — consumers using a different backend
implement their own and pass it to `RuntimeConfig.agent_source`.
"""

from __future__ import annotations

from agno_agent_builder.sources.base import AgentSource
from agno_agent_builder.sources.payload import PayloadAgentSource
from agno_agent_builder.sources.types import AgentConfig

__all__ = ["AgentConfig", "AgentSource", "PayloadAgentSource"]
