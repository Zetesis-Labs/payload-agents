"""Postgres LISTEN/NOTIFY bridge that triggers registry reloads on every pod."""

from __future__ import annotations

import asyncio
from collections.abc import Callable, Coroutine
from typing import Any

import psycopg

from agno_agent_builder.db import normalize_pg_url
from agno_agent_builder.logging import get_logger

logger = get_logger(__name__)

_RECONNECT_BACKOFF_BASE_S = 1.0
_RECONNECT_BACKOFF_MAX_S = 30.0


def _psycopg_url(url: str) -> str:
    """psycopg3 accepts ``postgres://`` and ``postgresql://`` but not the
    SQLAlchemy-flavoured ``postgresql+psycopg://`` prefix."""
    return normalize_pg_url(url).replace("postgresql+psycopg://", "postgresql://")


async def _listen_once(
    *,
    database_url: str,
    channel: str,
    on_notify: Callable[[str | None], Coroutine[Any, Any, None]],
) -> None:
    url = _psycopg_url(database_url)
    async with await psycopg.AsyncConnection.connect(url, autocommit=True) as conn:
        async with conn.cursor() as cur:
            await cur.execute(f"LISTEN {channel}")
        logger.info("Listening for reload notifications", channel=channel)
        async for notify in conn.notifies():
            logger.info(
                "Reload notification received",
                channel=notify.channel,
                payload=notify.payload or None,
            )
            await on_notify(notify.payload or None)


async def run_reload_listener(
    on_notify: Callable[[str | None], Coroutine[Any, Any, None]],
    *,
    database_url: str,
    channel: str,
) -> None:
    """Run the listen loop forever, reconnecting with exponential backoff on failure."""
    attempt = 0
    while True:
        try:
            await _listen_once(database_url=database_url, channel=channel, on_notify=on_notify)
        except asyncio.CancelledError:
            logger.info("Reload listener cancelled")
            raise
        except Exception:
            delay = min(_RECONNECT_BACKOFF_BASE_S * (2**attempt), _RECONNECT_BACKOFF_MAX_S)
            attempt += 1
            logger.warning(
                "Reload listener crashed, reconnecting",
                attempt=attempt,
                delay_s=delay,
                exc_info=True,
            )
            await asyncio.sleep(delay)
        else:
            attempt = 0
