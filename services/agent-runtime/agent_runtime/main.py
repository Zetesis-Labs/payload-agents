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
import hmac
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any, cast

from agno.agent import Agent
from agno.agent.remote import RemoteAgent
from agno.os import AgentOS
from fastapi import APIRouter, Header, HTTPException

from agent_runtime.config import settings
from agent_runtime.health import router as health_router
from agent_runtime.registry import AgentRegistry, dispose_shared_engine

# ── Logging (JSON for structured log collection in K8s) ───────────────────


class _JSONFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        import json as _json

        return _json.dumps(
            {
                "ts": self.formatTime(record, self.datefmt),
                "level": record.levelname,
                "logger": record.name,
                "msg": record.getMessage(),
                **({"exc": self.formatException(record.exc_info)} if record.exc_info else {}),
            },
            default=str,
            ensure_ascii=False,
        )


_handler = logging.StreamHandler()
_handler.setFormatter(_JSONFormatter())
logging.root.handlers = [_handler]
logging.root.setLevel(settings.log_level)
logger = logging.getLogger("agent_runtime")

# ── Registry + AgentOS ─────────────────────────────────────────────────────

registry = AgentRegistry()
_reload_lock = asyncio.Lock()


def _agents_as_union(agents: list[Agent]) -> list[Agent | RemoteAgent]:
    return cast(list[Agent | RemoteAgent], agents)


_BOOT_MAX_RETRIES = 10
_BOOT_BACKOFF_BASE = 2.0
_BOOT_BACKOFF_MAX = 30.0


@asynccontextmanager
async def lifespan(app: Any) -> AsyncIterator[None]:
    for attempt in range(1, _BOOT_MAX_RETRIES + 1):
        try:
            await registry.load_all()
            agent_os.agents = _agents_as_union(registry.all())
            logger.info("AgentOS initialised with %d agents", len(registry.all()))
            break
        except Exception:
            delay = min(_BOOT_BACKOFF_BASE**attempt, _BOOT_BACKOFF_MAX)
            if attempt < _BOOT_MAX_RETRIES:
                logger.warning(
                    "Bootstrap attempt %d/%d failed, retrying in %.0fs",
                    attempt,
                    _BOOT_MAX_RETRIES,
                    delay,
                    exc_info=True,
                )
                await asyncio.sleep(delay)
            else:
                logger.exception(
                    "Failed to bootstrap agent registry after %d attempts; starting empty",
                    _BOOT_MAX_RETRIES,
                )
    yield

    # ── Shutdown cleanup ──────────────────────────────────────────────────
    logger.info("Shutting down — disposing shared DB engine")
    await dispose_shared_engine()


# AgentOS accepts lifespan in its constructor
agent_os = AgentOS(
    name="zetesis-agent-runtime",
    db=registry.db,
    agents=[],
    telemetry=False,
    authorization=False,
    auto_provision_dbs=True,
    lifespan=lifespan,
)

# Build the full AgentOS FastAPI app (includes /agents/*/runs, /sessions, etc.)
app = agent_os.get_app()
app.include_router(health_router)

# ── Custom endpoints ───────────────────────────────────────────────────────

internal_router = APIRouter(prefix="/internal", tags=["internal"])


@internal_router.post("/agents/reload")
async def reload_agents(
    x_internal_secret: str | None = Header(default=None, alias="X-Internal-Secret"),
) -> dict[str, Any]:
    """Refresh the in-memory agent registry from Payload CMS.

    Called by Payload ``afterChange``/``afterDelete`` hooks on the Agents
    collection. Updates the AgentOS agent list so subsequent requests
    use the latest configurations.
    """
    if not hmac.compare_digest(x_internal_secret or "", settings.internal_secret):
        raise HTTPException(status_code=401, detail="invalid internal secret")
    async with _reload_lock:
        await registry.reload()
        agent_os.agents = _agents_as_union(registry.all())
    count = len(registry.all())
    logger.info("Reloaded %d agents", count)
    return {"count": count, "slugs": registry.slugs()}


app.include_router(internal_router)
