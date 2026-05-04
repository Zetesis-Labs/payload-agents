"""Payload CMS implementation of `AgentSource`.

Calls the dedicated internal endpoint on `@zetesis/payload-agents-core`
(`GET /api/<agents>/internal/list`) authenticated by `X-Internal-Secret`.
The endpoint runs Payload's local API with `overrideAccess: true` and
returns the active agents with apiKey decrypted + tenant/taxonomies
populated, so we don't depend on access-control bypasses in the host's
collections.
"""

from __future__ import annotations

from typing import Any

import httpx
from pydantic import SecretStr

from agno_agent_builder.logging import get_logger
from agno_agent_builder.sources.types import AgentConfig

logger = get_logger(__name__)

_DEFAULT_TIMEOUT_S = 10.0
_DEFAULT_COLLECTION_SLUG = "agents"
INTERNAL_SECRET_HEADER = "X-Internal-Secret"  # noqa: S105 — header name, not a secret value


class PayloadAgentSource:
    """Fetches agent configs from Payload CMS via the plugin's internal endpoint."""

    def __init__(
        self,
        *,
        base_url: str,
        internal_secret: str,
        collection_slug: str = _DEFAULT_COLLECTION_SLUG,
        timeout_s: float = _DEFAULT_TIMEOUT_S,
    ) -> None:
        if not internal_secret:
            raise ValueError("internal_secret is required")
        self._base_url = base_url.rstrip("/")
        self._internal_secret = internal_secret
        self._collection_slug = collection_slug
        self._timeout_s = timeout_s

    async def fetch_agents(self) -> list[AgentConfig]:
        url = f"{self._base_url}/api/{self._collection_slug}/internal/list"
        headers = {INTERNAL_SECRET_HEADER: self._internal_secret}

        async with httpx.AsyncClient(timeout=self._timeout_s) as client:
            response = await client.get(url, headers=headers)
            response.raise_for_status()
            data: dict[str, list[dict[str, Any]]] = response.json()

        configs: list[AgentConfig] = []
        for doc in data.get("docs", []):
            try:
                configs.append(payload_doc_to_agent_config(doc))
            except Exception:
                logger.exception("Skipping malformed Payload agent doc", agent_id=doc.get("id"))
        return configs


def payload_doc_to_agent_config(doc: dict[str, Any]) -> AgentConfig:
    """Map a Payload `agents` document into the normalized `AgentConfig`."""
    slug = doc.get("slug")
    if not isinstance(slug, str) or not slug:
        raise ValueError("agent document missing 'slug'")

    llm_model = doc.get("llmModel")
    if not isinstance(llm_model, str) or not llm_model:
        raise ValueError(f"agent {slug!r} missing 'llmModel'")

    api_key = doc.get("apiKey")
    if not isinstance(api_key, str) or not api_key:
        raise ValueError(f"agent {slug!r} missing 'apiKey'")

    tenant = doc.get("tenant")
    tenant_slug = tenant.get("slug") if isinstance(tenant, dict) else None

    taxonomy_slugs = _extract_taxonomy_slugs(doc.get("taxonomies"))

    search_collections = doc.get("searchCollections")
    if not isinstance(search_collections, list):
        search_collections = []
    search_collections = [s for s in search_collections if isinstance(s, str)]

    raw_limit = doc.get("toolCallLimit")
    tool_call_limit: int | None = None
    if raw_limit is not None:
        try:
            tool_call_limit = int(raw_limit)
        except (ValueError, TypeError):
            tool_call_limit = None

    return AgentConfig(
        slug=slug,
        name=doc.get("name") or slug,
        llm_model=llm_model,
        api_key=SecretStr(api_key),
        instructions_extra=doc.get("systemPrompt")
        if isinstance(doc.get("systemPrompt"), str)
        else None,
        tenant_slug=tenant_slug,
        taxonomy_slugs=taxonomy_slugs,
        search_collections=search_collections,
        tool_call_limit=tool_call_limit,
    )


def _extract_taxonomy_slugs(taxonomies: Any) -> list[str]:
    if not isinstance(taxonomies, list):
        return []
    slugs: list[str] = []
    for item in taxonomies:
        if isinstance(item, dict) and isinstance(item.get("slug"), str):
            slugs.append(item["slug"])
        elif isinstance(item, str):
            slugs.append(item)
    return slugs
