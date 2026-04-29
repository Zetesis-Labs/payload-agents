"""Agent construction — maps `AgentConfig` records into Agno `Agent` instances."""

from __future__ import annotations

from agno.agent import Agent
from agno.db.postgres import PostgresDb
from agno.models.anthropic import Claude
from agno.models.base import Model
from agno.models.openai import OpenAIChat, OpenAIResponses
from agno.tools.mcp import MCPTools
from agno.tools.mcp.params import StreamableHTTPClientParams

from agno_agent_builder.exceptions import InvalidModelError, UnsupportedProviderError
from agno_agent_builder.instructions import compose_instructions
from agno_agent_builder.sources.types import AgentConfig

_OPENAI_RESPONSES_PREFIXES = ("o1", "o3", "o4", "gpt-4.1", "gpt-5")
_NATIVE_REASONER_PREFIXES = ("o1", "o3", "o4")


def build_agent(
    cfg: AgentConfig,
    *,
    db: PostgresDb,
    mcp_url: str,
    tool_protocol: str | None = None,
    output_format: str | None = None,
) -> Agent:
    """Construct an Agno Agent from a normalized AgentConfig."""
    provider, _, model_id = cfg.llm_model.partition("/")
    if not model_id:
        raise InvalidModelError(slug=cfg.slug, llm_model=cfg.llm_model)

    is_native_reasoner = any(model_id.startswith(p) for p in _NATIVE_REASONER_PREFIXES)

    return Agent(
        name=cfg.name,
        id=cfg.slug,
        model=build_model(provider, model_id, cfg.api_key.get_secret_value()),
        instructions=compose_instructions(
            cfg, tool_protocol=tool_protocol, output_format=output_format
        ),
        db=db,
        tools=[build_mcp_tools(mcp_url, cfg.tenant_slug, cfg.taxonomy_slugs)],
        add_history_to_context=True,
        num_history_runs=5,
        reasoning=not is_native_reasoner,
        tool_call_limit=cfg.tool_call_limit,
        telemetry=False,
    )


def build_model(provider: str, model_id: str, api_key: str) -> Model:
    """Map a provider/model-id tuple to an Agno model instance."""
    if provider == "anthropic":
        return Claude(id=model_id, api_key=api_key)
    if provider == "openai":
        if any(model_id.startswith(p) for p in _OPENAI_RESPONSES_PREFIXES):
            return OpenAIResponses(id=model_id, api_key=api_key)
        return OpenAIChat(id=model_id, api_key=api_key)
    raise UnsupportedProviderError(provider=provider)


def build_mcp_tools(
    mcp_url: str,
    tenant_slug: str | None = None,
    taxonomy_slugs: list[str] | None = None,
) -> MCPTools:
    """Build an MCPTools instance with tenant/taxonomy headers."""
    headers: dict[str, str] = {}
    if tenant_slug:
        headers["x-tenant-slug"] = tenant_slug
    if taxonomy_slugs:
        headers["x-taxonomy-slugs"] = ",".join(taxonomy_slugs)
    if headers:
        params = StreamableHTTPClientParams(url=mcp_url, headers=headers)
        return MCPTools(server_params=params, transport="streamable-http")
    return MCPTools(url=mcp_url, transport="streamable-http")
