"""HTTP kicker.

Tiny FastAPI app the consumer process exposes so the Next.js side (or any
HTTP client) can enqueue a task without speaking the taskiq Redis protocol.

* ``GET /health`` and ``GET /ready`` — Kubernetes / Compose probes (no auth).
* ``POST /tasks/parse-document`` — body ``{"document_id": "<id>"}``, gated by
  the ``X-Internal-Secret`` header (matched against ``config.internal_secret``).
"""

from __future__ import annotations

import hmac
from typing import Any

import structlog
from fastapi import FastAPI, HTTPException, Request, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from taskiq import AsyncBroker

from payload_worker_builder.config import RuntimeConfig
from payload_worker_builder.tasks import PARSE_DOCUMENT_TASK_NAME

logger = structlog.get_logger("payload_worker_builder.http")


class ParseDocumentRequest(BaseModel):
    document_id: str


def create_http_app(broker: AsyncBroker, config: RuntimeConfig) -> FastAPI:
    """Build the FastAPI app the consumer hands to uvicorn."""
    app = FastAPI(title=config.app_name)

    @app.middleware("http")
    async def _internal_auth(request: Request, call_next: Any) -> Any:
        if request.url.path in config.public_paths:
            return await call_next(request)
        provided = request.headers.get("x-internal-secret", "")
        expected = config.internal_secret.get_secret_value()
        if not hmac.compare_digest(provided, expected):
            return JSONResponse(
                {"error": "Forbidden"},
                status_code=status.HTTP_403_FORBIDDEN,
            )
        return await call_next(request)

    @app.on_event("startup")
    async def _startup() -> None:  # pyright: ignore[reportUnusedFunction]
        if not broker.is_worker_process:
            await broker.startup()
            logger.info("Broker connected (kicker side)", url=config.redis_url)

    @app.on_event("shutdown")
    async def _shutdown() -> None:  # pyright: ignore[reportUnusedFunction]
        if not broker.is_worker_process:
            await broker.shutdown()

    @app.get("/health")
    async def health() -> dict[str, str]:  # pyright: ignore[reportUnusedFunction]
        return {"status": "ok"}

    @app.get("/ready")
    async def ready() -> dict[str, str]:  # pyright: ignore[reportUnusedFunction]
        return {"status": "ok"}

    @app.post("/tasks/parse-document", status_code=status.HTTP_202_ACCEPTED)
    async def kick_parse_document(  # pyright: ignore[reportUnusedFunction]
        body: ParseDocumentRequest,
    ) -> dict[str, str]:
        if not body.document_id.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="document_id is required",
            )
        task = broker.find_task(PARSE_DOCUMENT_TASK_NAME)
        if task is None:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Task {PARSE_DOCUMENT_TASK_NAME} is not registered",
            )
        await task.kiq(body.document_id)
        logger.info("Enqueued parse-document task", document_id=body.document_id)
        return {"status": "queued", "task": PARSE_DOCUMENT_TASK_NAME}

    return app
