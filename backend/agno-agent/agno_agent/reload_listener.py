"""Postgres LISTEN/NOTIFY bridge that triggers registry reloads on every pod.

A dedicated async psycopg connection sits in autocommit mode LISTENing on the
``agent_reload`` channel. When Payload's afterChange/afterDelete hook fires a
``NOTIFY agent_reload`` every replica sees the notification and refreshes its
in-memory registry — fixing the multi-replica bug where an HTTP reload only
reached whichever pod the Service routed the request to.
"""

from __future__ import annotations

import asyncio
from collections.abc import Callable, Coroutine
from typing import Any

import psycopg

from agno_agent.config import settings
from agno_agent.db import normalize_pg_url
from agno_agent.logging import get_logger

logger = get_logger(__name__)

RELOAD_CHANNEL = "agent_reload"

_RECONNECT_BACKOFF_BASE_S = 1.0
_RECONNECT_BACKOFF_MAX_S = 30.0


def _psycopg_url(url: str) -> str:
    """psycopg3 accepts ``postgres://`` and ``postgresql://`` but not the
    SQLAlchemy-flavoured ``postgresql+psycopg://`` prefix."""
    normalized = normalize_pg_url(url)
    return normalized.replace("postgresql+psycopg://", "postgresql://")


async def _listen_once(
    on_notify: Callable[[str | None], Coroutine[Any, Any, None]],
) -> None:
    url = _psycopg_url(settings.database_url)
    async with await psycopg.AsyncConnection.connect(url, autocommit=True) as conn:
        async with conn.cursor() as cur:
            await cur.execute(f"LISTEN {RELOAD_CHANNEL}")
        logger.info("Listening for reload notifications", channel=RELOAD_CHANNEL)
        async for notify in conn.notifies():
            logger.info(
                "Reload notification received",
                channel=notify.channel,
                payload=notify.payload or None,
            )
            await on_notify(notify.payload or None)


async def run_reload_listener(
    on_notify: Callable[[str | None], Coroutine[Any, Any, None]],
) -> None:
    """Run the listen loop forever, reconnecting with exponential backoff on failure.

    Meant to be spawned as a background task during the FastAPI lifespan.
    """
    attempt = 0
    while True:
        try:
            await _listen_once(on_notify)
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
