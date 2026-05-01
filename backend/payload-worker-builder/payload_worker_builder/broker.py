"""Broker factory.

Returns a configured `RedisStreamBroker` with `SmartRetryMiddleware`. Mirrors
the pattern from nixon's `nixon_worker_core.broker_factory.create_broker`:
one place that owns broker config so consumers never instantiate
`RedisStreamBroker` directly.
"""

from __future__ import annotations

from taskiq import AsyncBroker, SmartRetryMiddleware
from taskiq_redis import RedisStreamBroker

from payload_worker_builder.config import RuntimeConfig


def create_broker(config: RuntimeConfig) -> AsyncBroker:
    """Build the broker the consumer's `main.py` should expose to taskiq."""
    return RedisStreamBroker(url=config.redis_url).with_middlewares(SmartRetryMiddleware())
