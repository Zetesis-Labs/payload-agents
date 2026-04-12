"""Shared async SQLAlchemy engine for health checks and session persistence."""

from __future__ import annotations

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
        self.engine = None

    def get(self):  # type: ignore[return]
        if self.engine is None:
            from sqlalchemy.ext.asyncio import create_async_engine

            url = normalize_pg_url(settings.database_url).replace(
                "postgresql+psycopg://", "postgresql+psycopg_async://"
            )
            self.engine = create_async_engine(url, pool_size=1, pool_pre_ping=True)
        return self.engine

    async def dispose(self) -> None:
        if self.engine is not None:
            await self.engine.dispose()
            self.engine = None


_holder = _EngineHolder()


async def check_db() -> bool:
    """Quick SELECT 1 for readiness probes."""
    try:
        engine = _holder.get()
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
