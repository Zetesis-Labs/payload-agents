"""Logging + structured boot for the worker process.

Mirrors the spirit of `agno_agent_builder.app.create_app` lifespan but kept
much simpler — there's no registry/listener to bootstrap. We just configure
structlog so taskiq + FastAPI logs share the same JSON sink.
"""

from __future__ import annotations

import logging

import structlog

from payload_documents_worker_builder.config import RuntimeConfig


def configure_logging(config: RuntimeConfig) -> None:
    """Idempotent structlog setup so both processes (uvicorn + taskiq) match."""
    level = getattr(logging, config.log_level.upper(), logging.INFO)
    logging.basicConfig(level=level, format="%(message)s")
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(level),
        cache_logger_on_first_use=True,
    )
