"""Shared async SQLAlchemy engine for health checks and session persistence."""

from __future__ import annotations

import asyncio

from sqlalchemy.ext.asyncio import AsyncEngine

from agent_runtime.config import settings
from agent_runtime.logging import get_logger

logger = get_logger(__name__)


def normalize_pg_url(url: str) -> str:
    """Force psycopg v3 driver (installed via agno[postgres])."""
    for prefix in ("postgresql://", "postgres://"):
        if url.startswith(prefix):
            return "postgresql+psycopg://" + url[len(prefix) :]
    return url


class _EngineHolder:
    """Module-level singleton — avoids bare `global` statements."""

    def __init__(self) -> None:
        self.engine: AsyncEngine | None = None
        self._lock = asyncio.Lock()

    async def get(self) -> AsyncEngine:
        if self.engine is not None:
            return self.engine
        async with self._lock:
            # Double-check after acquiring lock
            if self.engine is not None:
                return self.engine
            from sqlalchemy.ext.asyncio import create_async_engine

            sync_url = normalize_pg_url(settings.database_url)
            # Use the explicit psycopg_async dialect for create_async_engine
            async_url = sync_url.replace("postgresql+psycopg://", "postgresql+psycopg_async://")
            self.engine = create_async_engine(async_url, pool_size=5, pool_pre_ping=True)
            return self.engine

    async def dispose(self) -> None:
        if self.engine is not None:
            await self.engine.dispose()
            self.engine = None


_holder = _EngineHolder()


async def check_db() -> bool:
    """Quick SELECT 1 for readiness probes."""
    try:
        engine = await _holder.get()
        async with engine.connect() as conn:
            from sqlalchemy import text

            await conn.execute(text("SELECT 1"))
        return True
    except Exception:
        logger.warning("DB health check failed", exc_info=True)
        return False


async def dispose_shared_engine() -> None:
    """Dispose the shared engine on shutdown."""
    await _holder.dispose()
