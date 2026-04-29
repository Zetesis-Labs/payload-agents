"""Async SQLAlchemy engine helper for health checks.

Stateless — `EngineHolder` is instantiated per-app inside `create_app` so
multiple runtime instances (tests, multi-tenancy) don't share a cached
engine. `normalize_pg_url` is exported because `reload_listener` and
session storage need the same scheme normalization.
"""

from __future__ import annotations

import asyncio

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from agno_agent_builder.logging import get_logger

logger = get_logger(__name__)


def normalize_pg_url(url: str) -> str:
    """Force psycopg v3 driver (installed via agno[postgres])."""
    for prefix in ("postgresql://", "postgres://"):
        if url.startswith(prefix):
            return "postgresql+psycopg://" + url[len(prefix) :]
    return url


class EngineHolder:
    """Lazy async engine cache, scoped to one runtime instance."""

    def __init__(self, database_url: str) -> None:
        self._database_url = database_url
        self._engine: AsyncEngine | None = None
        self._lock = asyncio.Lock()

    async def get(self) -> AsyncEngine:
        if self._engine is not None:
            return self._engine
        async with self._lock:
            if self._engine is not None:
                return self._engine
            sync_url = normalize_pg_url(self._database_url)
            async_url = sync_url.replace("postgresql+psycopg://", "postgresql+psycopg_async://")
            self._engine = create_async_engine(async_url, pool_size=5, pool_pre_ping=True)
            return self._engine

    async def check(self) -> bool:
        try:
            engine = await self.get()
            async with engine.connect() as conn:
                await conn.execute(text("SELECT 1"))
            return True
        except Exception:
            logger.warning("DB health check failed", exc_info=True)
            return False

    async def dispose(self) -> None:
        if self._engine is not None:
            await self._engine.dispose()
            self._engine = None
