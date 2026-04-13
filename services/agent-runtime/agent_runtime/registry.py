"""Agent registry: loads configurations from Payload CMS, delegates building to builder module."""

from __future__ import annotations

from typing import Any

import httpx
from agno.agent import Agent
from agno.db.postgres import PostgresDb

from agent_runtime.builder import build_agent
from agent_runtime.config import settings
from agent_runtime.db import normalize_pg_url
from agent_runtime.logging import get_logger

logger = get_logger(__name__)

_PAYLOAD_TIMEOUT_S = 10.0


class AgentRegistry:
    """Thread-safe (single event loop) registry of Agno agents keyed by slug."""

    def __init__(self) -> None:
        self._agents: dict[str, Agent] = {}
        self._db = PostgresDb(
            db_url=normalize_pg_url(settings.database_url),
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
        """Fetch active agents from Payload and rebuild the registry."""
        docs = await self._fetch_from_payload()
        new_agents: dict[str, Agent] = {}
        for doc in docs:
            slug = doc.get("slug")
            if not slug:
                logger.warning("Skipping agent with missing slug", agent_id=doc.get("id"))
                continue
            try:
                new_agents[slug] = build_agent(doc, db=self._db)
            except Exception:
                logger.exception("Failed to build agent", slug=slug)

        self._agents = new_agents
        logger.info("Agents loaded from Payload", count=len(new_agents))

    async def reload(self) -> None:
        """Re-fetch agents from Payload."""
        await self.load_all()

    async def _fetch_from_payload(self) -> list[dict[str, Any]]:
        """GET /api/agents?where[isActive]=true from Payload CMS."""
        url = f"{settings.payload_url.rstrip('/')}/api/agents"
        params: dict[str, str | int] = {
            "where[isActive][equals]": "true",
            "depth": 1,
            "limit": 1000,
        }
        headers: dict[str, str] = {"X-Runtime-Secret": settings.internal_secret}
        if settings.payload_service_token:
            headers["Authorization"] = f"Bearer {settings.payload_service_token}"

        async with httpx.AsyncClient(timeout=_PAYLOAD_TIMEOUT_S) as client:
            response = await client.get(url, params=params, headers=headers)
            response.raise_for_status()
            data: dict[str, list[dict[str, Any]]] = response.json()

        return data.get("docs", [])
