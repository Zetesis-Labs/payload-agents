"""Agent Runtime — AgentOS-based FastAPI app.

Exposes the full AgentOS REST API (30+ endpoints) including:

* ``POST /agents/{agent_id}/runs`` — streaming SSE chat (Form data)
* ``GET /agents`` — list registered agents
* ``GET /sessions/*`` — session browser
* ``GET /metrics/*``, ``GET /traces/*`` — observability
* ``GET /docs`` — Swagger UI

Custom additions:

* ``POST /internal/agents/reload`` — triggered by Payload hooks
* ``GET /health``, ``GET /ready`` — Kubernetes probes
"""

from __future__ import annotations

import asyncio
import contextlib
import hmac
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any, cast

from agno.agent import Agent
from agno.agent.remote import RemoteAgent
from agno.os import AgentOS
from fastapi import APIRouter, Depends, Header

from agent_runtime.config import settings
from agent_runtime.db import dispose_shared_engine
from agent_runtime.dependencies import get_registry
from agent_runtime.exceptions import (
    AgentRuntimeError,
    AuthenticationError,
    agent_runtime_exception_handler,
)
from agent_runtime.health import router as health_router
from agent_runtime.logging import configure_logging, get_logger
from agent_runtime.middleware import InternalAuthMiddleware, RequestIdMiddleware
from agent_runtime.registry import AgentRegistry
from agent_runtime.reload_listener import run_reload_listener
from agent_runtime.schemas import ErrorResponse, ReloadResponse

configure_logging(settings.log_level)
logger = get_logger("agent_runtime")

# ── Registry + AgentOS ─────────────────────────────────────────────────────

registry = AgentRegistry()
_reload_lock = asyncio.Lock()


def _agents_as_union(agents: list[Agent]) -> list[Agent | RemoteAgent]:
    return cast(list[Agent | RemoteAgent], agents)


_BOOT_MAX_RETRIES = 10
_BOOT_BACKOFF_BASE = 2.0
_BOOT_BACKOFF_MAX = 30.0

# Belt-and-braces full resync, independent of the LISTEN/NOTIFY channel.
# Covers the gap where a reconnecting listener misses a NOTIFY: the next
# tick picks the edit up at most this many seconds late.
_RESYNC_INTERVAL_S = 300.0


async def _reload_registry(_payload: str | None = None) -> None:
    """Callback handed to the listener; serialised with the lock used by
    the internal HTTP endpoint so we never mutate ``agent_os.agents`` twice
    at the same time."""
    async with _reload_lock:
        await registry.reload()
        agent_os.agents = _agents_as_union(registry.all())
    logger.info("Registry reloaded via notify", count=len(registry.all()), slugs=registry.slugs())


async def _periodic_resync() -> None:
    """Unconditional full reload every `_RESYNC_INTERVAL_S` seconds.

    Closes the durability gap of `LISTEN/NOTIFY`: if the listener connection
    is dropped at the moment of a NOTIFY, the message is lost. This tick
    guarantees bounded staleness — at worst `_RESYNC_INTERVAL_S` seconds
    behind Payload.
    """
    while True:
        await asyncio.sleep(_RESYNC_INTERVAL_S)
        try:
            await _reload_registry()
        except Exception:
            logger.exception("Periodic resync failed, will retry on next tick")


@asynccontextmanager
async def lifespan(app: Any) -> AsyncIterator[None]:
    # Make registry available via app.state for Depends injection
    app.state.registry = registry

    for attempt in range(1, _BOOT_MAX_RETRIES + 1):
        try:
            await registry.load_all()
            agent_os.agents = _agents_as_union(registry.all())
            logger.info("AgentOS initialised", agent_count=len(registry.all()))
            break
        except Exception:
            delay = min(_BOOT_BACKOFF_BASE**attempt, _BOOT_BACKOFF_MAX)
            if attempt < _BOOT_MAX_RETRIES:
                logger.warning(
                    "Bootstrap failed, retrying",
                    attempt=attempt,
                    max_retries=_BOOT_MAX_RETRIES,
                    delay_s=delay,
                    exc_info=True,
                )
                await asyncio.sleep(delay)
            else:
                logger.critical(
                    "Failed to bootstrap after max retries — service will only expose health endpoints",
                    max_retries=_BOOT_MAX_RETRIES,
                    exc_info=True,
                )

    listener_task = asyncio.create_task(run_reload_listener(_reload_registry))
    resync_task = asyncio.create_task(_periodic_resync())
    yield
    for task in (listener_task, resync_task):
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task

    logger.info("Shutting down — disposing shared DB engine")
    await dispose_shared_engine()


agent_os = AgentOS(
    name="zetesis-agent-runtime",
    db=registry.db,
    agents=[],
    telemetry=False,
    authorization=False,
    auto_provision_dbs=True,
    lifespan=lifespan,
)

app = agent_os.get_app()
app.add_middleware(RequestIdMiddleware)
app.add_middleware(InternalAuthMiddleware, secret=settings.internal_secret)
app.add_exception_handler(AgentRuntimeError, agent_runtime_exception_handler)  # type: ignore[arg-type]
app.include_router(health_router)

# ── Custom endpoints ───────────────────────────────────────────────────────

internal_router = APIRouter(prefix="/internal", tags=["internal"])


@internal_router.post(
    "/agents/reload",
    response_model=ReloadResponse,
    responses={401: {"model": ErrorResponse}},
)
async def reload_agents(
    reg: AgentRegistry = Depends(get_registry),
    x_internal_secret: str | None = Header(default=None, alias="X-Internal-Secret"),
) -> ReloadResponse:
    """Refresh the in-memory agent registry from Payload CMS."""
    if not hmac.compare_digest(x_internal_secret or "", settings.internal_secret):
        raise AuthenticationError()
    async with _reload_lock:
        await reg.reload()
        agent_os.agents = _agents_as_union(reg.all())
    count = len(reg.all())
    logger.info("Agents reloaded", count=count, slugs=reg.slugs())
    return ReloadResponse(count=count, slugs=reg.slugs())


app.include_router(internal_router)
