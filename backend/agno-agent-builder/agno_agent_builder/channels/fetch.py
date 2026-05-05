"""Generic helper for the `/api/<collection>/internal/list` endpoint pattern
the host CMS exposes for every channel installation collection.
"""

from __future__ import annotations

from typing import Any, cast

import httpx
import structlog

logger = structlog.get_logger("agno_agent_builder.channels.fetch")

INTERNAL_SECRET_HEADER = "X-Internal-Secret"  # noqa: S105


async def fetch_installation_docs(
    *,
    payload_url: str,
    internal_secret: str,
    collection_slug: str,
    timeout_s: float = 10.0,
) -> list[dict[str, Any]]:
    """GET /api/<collection_slug>/internal/list and return `docs`.

    Returns an empty list when the host doesn't expose the endpoint (404) or
    the call fails — callers continue without bots, never crash boot.
    """
    if not internal_secret:
        logger.warning("Channel loader skipped: internal_secret empty", collection=collection_slug)
        return []

    url = f"{payload_url.rstrip('/')}/api/{collection_slug}/internal/list"
    async with httpx.AsyncClient(timeout=timeout_s) as client:
        try:
            response = await client.get(url, headers={INTERNAL_SECRET_HEADER: internal_secret})
        except httpx.HTTPError:
            logger.exception("Failed to fetch channel installations", collection=collection_slug)
            return []

    if response.status_code == 404:
        return []
    if not response.is_success:
        logger.error(
            "Channel installations endpoint returned non-2xx",
            collection=collection_slug,
            status_code=response.status_code,
            body=response.text[:200],
        )
        return []

    return cast(list[dict[str, Any]], response.json().get("docs", []))
