"""Agent construction — maps Payload documents to Agno Agent instances."""

from __future__ import annotations

from typing import Any

from agno.agent import Agent
from agno.db.postgres import PostgresDb
from agno.models.anthropic import Claude
from agno.models.base import Model
from agno.models.openai import OpenAIChat, OpenAIResponses
from agno.tools.mcp import MCPTools
from agno.tools.mcp.params import StreamableHTTPClientParams

from agno_agent.config import settings
from agno_agent.exceptions import InvalidModelError, MissingApiKeyError, UnsupportedProviderError
from agno_agent.instructions import compose_instructions, extract_taxonomy_slugs
from agno_agent.logging import get_logger

logger = get_logger(__name__)

# Models that require the OpenAI Responses API instead of Chat Completions.
_OPENAI_RESPONSES_PREFIXES = ("o1", "o3", "o4", "gpt-4.1", "gpt-5")


def build_agent(cfg: dict[str, Any], *, db: PostgresDb) -> Agent:
    """Construct an Agno Agent from a Payload Agents document."""
    slug = cfg.get("slug", "unknown")
    llm_model = cfg.get("llmModel")
    if not llm_model:
        raise InvalidModelError(slug=slug, llm_model="")
    provider, _, model_id = str(llm_model).partition("/")
    if not model_id:
        raise InvalidModelError(slug=slug, llm_model=str(llm_model))

    api_key = cfg.get("apiKey")
    if not api_key:
        raise MissingApiKeyError(slug=slug)

    tenant = cfg.get("tenant")
    tenant_slug = tenant.get("slug") if isinstance(tenant, dict) else None

    taxonomy_slugs = extract_taxonomy_slugs(cfg.get("taxonomies"))

    # Native reasoning models (o-series) already think step-by-step;
    # Agno's reasoning=True is only useful for non-reasoning models.
    is_native_reasoner = any(model_id.startswith(p) for p in ("o1", "o3", "o4"))

    raw_limit = cfg.get("toolCallLimit")
    tool_call_limit: int | None = None
    if raw_limit is not None:
        try:
            tool_call_limit = int(raw_limit)
        except (ValueError, TypeError):
            logger.warning("Invalid toolCallLimit, ignoring", slug=slug, value=raw_limit)

    return Agent(
        name=cfg.get("name", slug),
        id=slug,
        model=build_model(provider, model_id, api_key),
        instructions=compose_instructions(cfg),
        db=db,
        tools=[build_mcp_tools(tenant_slug, taxonomy_slugs)],
        add_history_to_context=True,
        num_history_runs=5,
        reasoning=not is_native_reasoner,
        tool_call_limit=tool_call_limit,
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
    tenant_slug: str | None = None, taxonomy_slugs: list[str] | None = None
) -> MCPTools:
    """Build an MCPTools instance with tenant/taxonomy headers."""
    headers: dict[str, str] = {}
    if tenant_slug:
        headers["x-tenant-slug"] = tenant_slug
    if taxonomy_slugs:
        headers["x-taxonomy-slugs"] = ",".join(taxonomy_slugs)
    if headers:
        params = StreamableHTTPClientParams(
            url=settings.mcp_url,
            headers=headers,
        )
        return MCPTools(server_params=params, transport="streamable-http")
    return MCPTools(url=settings.mcp_url, transport="streamable-http")
