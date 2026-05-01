"""Top-level factory.

Consumers call ``create_app(config)`` and get back two ready-to-run handles:

* ``broker`` — the taskiq broker. Pass it to the taskiq CLI:
  ``taskiq worker my_worker.main:broker``.
* ``app`` — the FastAPI HTTP kicker. Run with uvicorn:
  ``uvicorn my_worker.main:app``.

Both share the same ``RuntimeConfig`` so logs, retries, and credentials line
up across processes.
"""

from __future__ import annotations

from collections.abc import Iterator
from dataclasses import dataclass

from fastapi import FastAPI
from taskiq import AsyncBroker

from payload_worker_builder.broker import create_broker
from payload_worker_builder.config import RuntimeConfig
from payload_worker_builder.http import create_http_app
from payload_worker_builder.lifecycle import configure_logging
from payload_worker_builder.tasks import register_parse_document_task


@dataclass(slots=True, frozen=True)
class WorkerApp:
    """Bundle returned by :func:`create_app`. Exposed as a dataclass so consumers
    can ``app, broker = create_app(config)`` (`__iter__` below) or address
    fields by name explicitly."""

    app: FastAPI
    broker: AsyncBroker

    def __iter__(self) -> Iterator[FastAPI | AsyncBroker]:
        yield self.app
        yield self.broker


def create_app(config: RuntimeConfig) -> WorkerApp:
    """Build the broker, register built-in tasks, and wrap a FastAPI kicker."""
    configure_logging(config)
    broker = create_broker(config)
    register_parse_document_task(broker, config)
    http_app = create_http_app(broker, config)
    return WorkerApp(app=http_app, broker=broker)
