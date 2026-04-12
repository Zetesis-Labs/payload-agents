"""Agent registry: loads Agent configurations from Payload CMS and builds Agno Agents.

Agents are loaded once at startup via :meth:`AgentRegistry.load_all` and can be
refreshed at runtime via :meth:`AgentRegistry.reload` (triggered by Payload
afterChange/afterDelete hooks hitting ``/internal/agents/reload``).

Every Agent uses the shared :class:`PostgresDb` so sessions are persisted across
replicas and isolated per ``user_id`` / ``session_id``.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx
from agno.agent import Agent
from agno.db.postgres import PostgresDb
from agno.models.anthropic import Claude
from agno.models.base import Model
from agno.models.openai import OpenAIChat
from agno.tools.mcp import MCPTools
from agno.tools.mcp.params import StreamableHTTPClientParams

from agent_runtime.config import settings

logger = logging.getLogger(__name__)

_PAYLOAD_TIMEOUT_S = 10.0


async def _check_db() -> bool:
    """Quick SELECT 1 against the shared async engine for Agno sessions."""
    try:
        engine = _get_shared_engine()
        async with engine.connect() as conn:
            from sqlalchemy import text

            await conn.execute(text("SELECT 1"))
        return True
    except Exception:
        logger.warning("DB health check failed", exc_info=True)
        return False


_shared_engine = None


def _get_shared_engine():  # type: ignore[return]
    """Lazily create a shared async SQLAlchemy engine for health checks."""
    global _shared_engine  # noqa: PLW0603
    if _shared_engine is None:
        from sqlalchemy.ext.asyncio import create_async_engine

        url = _normalize_pg_url(settings.database_url).replace(
            "postgresql+psycopg://", "postgresql+psycopg_async://"
        )
        _shared_engine = create_async_engine(url, pool_size=1, pool_pre_ping=True)
    return _shared_engine


async def dispose_shared_engine() -> None:
    """Dispose the shared engine on shutdown."""
    global _shared_engine  # noqa: PLW0603
    if _shared_engine is not None:
        await _shared_engine.dispose()
        _shared_engine = None


def _normalize_pg_url(url: str) -> str:
    """Force SQLAlchemy to use ``psycopg`` (v3, installed via ``agno[postgres]``)
    instead of the default ``psycopg2`` which we don't ship.
    """
    for prefix in ("postgresql://", "postgres://"):
        if url.startswith(prefix):
            return "postgresql+psycopg://" + url[len(prefix) :]
    return url


class AgentRegistry:
    """Thread-safe (single event loop) registry of Agno agents keyed by slug."""

    def __init__(self) -> None:
        self._agents: dict[str, Agent] = {}
        self._db = PostgresDb(
            db_url=_normalize_pg_url(settings.database_url),
            db_schema=settings.database_schema,
        )

    @property
    def db(self) -> PostgresDb:
        return self._db

    def get(self, slug: str) -> Agent | None:
        return self._agents.get(slug)

    def all(self) -> list[Agent]:
        return list(self._agents.values())

    def slugs(self) -> list[str]:
        return list(self._agents.keys())

    async def load_all(self) -> None:
        """Fetch all active agents from Payload and build the in-memory registry."""
        url = f"{settings.payload_url.rstrip('/')}/api/agents"
        params: dict[str, str | int] = {
            "where[isActive][equals]": "true",
            "depth": 1,
            "limit": 1000,
        }
        headers: dict[str, str] = {"X-Internal-Request": "true"}
        if settings.payload_service_token:
            headers["Authorization"] = f"Bearer {settings.payload_service_token}"

        async with httpx.AsyncClient(timeout=_PAYLOAD_TIMEOUT_S) as client:
            response = await client.get(url, params=params, headers=headers)
            response.raise_for_status()

        docs: list[dict[str, Any]] = response.json().get("docs", [])
        new_agents: dict[str, Agent] = {}
        for doc in docs:
            slug = doc.get("slug")
            if not slug:
                logger.warning("Skipping agent with missing slug: %r", doc.get("id"))
                continue
            try:
                new_agents[slug] = self._build(doc)
            except Exception:
                logger.exception("Failed to build agent %r", slug)

        self._agents = new_agents
        logger.info("Loaded %d active agents from Payload", len(new_agents))

    async def reload(self) -> None:
        """Re-fetch agents from Payload. Called by the ``/internal/agents/reload`` endpoint."""
        await self.load_all()

    def _build(self, cfg: dict[str, Any]) -> Agent:
        """Construct an Agno ``Agent`` from a Payload Agents document."""
        provider, _, model_id = str(cfg["llmModel"]).partition("/")
        if not model_id:
            raise ValueError(
                f"Invalid llmModel {cfg.get('llmModel')!r}; expected 'provider/model-id'"
            )

        api_key = cfg.get("apiKey")
        if not api_key:
            raise ValueError(f"Agent {cfg.get('slug')!r} has no apiKey")

        # Extract tenant slug from the populated tenant relationship
        tenant = cfg.get("tenant")
        tenant_slug = tenant.get("slug") if isinstance(tenant, dict) else None

        # Extract taxonomy slugs for server-enforced content scoping
        taxonomy_slugs = self._extract_taxonomy_slugs(cfg.get("taxonomies"))

        return Agent(
            name=cfg.get("name", cfg["slug"]),
            id=cfg["slug"],
            model=self._build_model(provider, model_id, api_key),
            instructions=self._compose_instructions(cfg),
            db=self._db,
            tools=[self._build_mcp_tools(tenant_slug, taxonomy_slugs)],
            add_history_to_context=True,
            num_history_runs=5,
            markdown=True,
            reasoning=True,
            telemetry=False,
        )

    @staticmethod
    def _extract_taxonomy_slugs(taxonomies: list[Any] | None) -> list[str]:
        """Extract taxonomy slugs from the populated taxonomies relationship."""
        if not isinstance(taxonomies, list):
            return []
        slugs: list[str] = []
        for item in taxonomies:
            if isinstance(item, dict) and isinstance(item.get("slug"), str):
                slugs.append(item["slug"])
            elif isinstance(item, str):
                slugs.append(item)
        return slugs

    @staticmethod
    def _build_mcp_tools(
        tenant_slug: str | None = None, taxonomy_slugs: list[str] | None = None
    ) -> MCPTools:
        """Build an MCPTools instance pointing at the MCP server.

        Passes ``x-tenant-slug`` and ``x-taxonomy-slugs`` headers to
        enforce content scoping server-side. The agent-runtime calls the
        MCP service directly (no proxy), so no Bearer token is needed.
        """
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

    @staticmethod
    def _build_model(provider: str, model_id: str, api_key: str) -> Model:
        """Map a ``provider/model-id`` tuple to an Agno model instance.

        Reasoning models (e.g. ``openai/gpt-5``, ``openai/o3-mini``) inherit the
        default ``reasoning_effort`` from the LLM provider. Override explicitly
        in the Payload Agent's system prompt if needed.
        """
        if provider == "anthropic":
            return Claude(id=model_id, api_key=api_key)
        if provider == "openai":
            return OpenAIChat(id=model_id, api_key=api_key)
        raise ValueError(
            f"Unsupported LLM provider {provider!r}. "
            f"Expected one of: 'anthropic', 'openai'."
        )

    @staticmethod
    def _compose_instructions(cfg: dict[str, Any]) -> str:
        """Build the full system prompt by joining fields from Payload.

        Structure:  personality  →  RAG hints  →  tool use protocol.

        The tool-use protocol is appended to *every* agent so they all follow
        a consistent multi-step retrieval workflow regardless of personality.
        """
        parts: list[str] = []

        system_prompt = cfg.get("systemPrompt")
        if isinstance(system_prompt, str) and system_prompt.strip():
            parts.append(system_prompt.strip())

        taxonomies = cfg.get("taxonomies")
        taxonomy_slugs: list[str] = []
        if isinstance(taxonomies, list):
            for item in taxonomies:
                if isinstance(item, dict) and isinstance(item.get("slug"), str):
                    taxonomy_slugs.append(item["slug"])
                elif isinstance(item, str):
                    taxonomy_slugs.append(item)
            if taxonomy_slugs:
                parts.append(f"[RAG filter: taxonomy_slugs={','.join(taxonomy_slugs)}]")

        search_collections = cfg.get("searchCollections")
        if isinstance(search_collections, list) and search_collections:
            parts.append(f"[RAG collections: {','.join(search_collections)}]")

        parts.append(_TOOL_USE_PROTOCOL)

        return "\n\n".join(parts)


# ---------------------------------------------------------------------------
# Standard tool-use protocol appended to every agent's instructions.
# Guides the LLM through multi-step retrieval instead of single-shot search.
# ---------------------------------------------------------------------------
_TOOL_USE_PROTOCOL = """\
## Tool use protocol

You have access to a search index via MCP tools. Follow these rules:

### Search workflow
1. **Search first** — use `search_collections` with 1-2 concept keywords. \
Always pass `taxonomy_slugs` from the [RAG filter] above in the `filters` parameter. \
Never put author names or meta-words ("opinión", "dice", "piensa") in the query.
2. **Evaluate results** — if you get fewer than 3 hits, shorten the query to 1 keyword \
or retry in `mode: "lexical"`.
3. **Read full context** — when a search hit looks relevant, call `get_chunks_by_parent` \
with its `parent_doc_id` to read the surrounding paragraphs before answering. \
A single chunk rarely has enough context on its own.
4. **Cite sources** — reference the document title for every claim you make.

### Multiple tool calls
- You CAN and SHOULD make multiple tool calls in a single turn when needed.
- A typical good turn: search → read full doc → (optionally search again with a different angle) → answer.
- Do NOT answer from a single search result if the question is broad. Gather evidence from 2-3 documents first.
- If the first search returns nothing useful, reformulate and search again before saying you have no information."""
