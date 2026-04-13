"""Structured logging configuration (structlog + stdlib)."""

from __future__ import annotations

import logging
import sys
from typing import Any

import structlog
from structlog.stdlib import BoundLogger


def configure_logging(log_level: str = "INFO") -> None:
    """Configure structured logging for the application."""
    processors: list[Any] = [
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        _add_request_id,
        _format_processor(log_level),
    ]

    structlog.configure(
        processors=processors,
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )

    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=getattr(logging, log_level.upper(), logging.INFO),
    )


def _format_processor(log_level: str) -> Any:
    """JSON in production (INFO+), console with colors in development (DEBUG)."""
    if log_level.upper() == "DEBUG":
        return structlog.dev.ConsoleRenderer(colors=True)
    return structlog.processors.JSONRenderer(ensure_ascii=False)


def _add_request_id(
    _logger: Any, _method_name: str, event_dict: dict[str, Any]
) -> dict[str, Any]:
    """Inject correlation ID from the request context if available."""
    from agent_runtime.middleware import request_id_var

    rid = request_id_var.get("")
    if rid:
        event_dict["request_id"] = rid
    return event_dict


def get_logger(name: str | None = None) -> BoundLogger:
    """Get a structured logger instance."""
    return structlog.get_logger(name)  # type: ignore[return-value]
