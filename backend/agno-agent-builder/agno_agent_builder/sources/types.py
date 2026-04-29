"""Normalized agent configuration shape decoupled from any specific CMS."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, SecretStr


class AgentConfig(BaseModel):
    """Per-agent configuration consumed by `build_agent`.

    Sources adapt their CMS-specific document shapes into this normalized
    model so the rest of the runtime is CMS-agnostic.
    """

    model_config = ConfigDict(extra="forbid")

    slug: str
    name: str
    llm_model: str
    api_key: SecretStr
    instructions_extra: str | None = None
    tenant_slug: str | None = None
    taxonomy_slugs: list[str] = []
    search_collections: list[str] = []
    tool_call_limit: int | None = None
