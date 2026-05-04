"""Parse-document task.

Single responsibility: take a Payload document id, download its file, kick a
LlamaParse upload, poll until the result is ready, write the parsed markdown
back into Payload, and stamp `parse_status` accordingly.

The task is registered against a broker via ``register_parse_document_task``
so consumers can compose multiple workers on the same broker without us
hard-coding the binding.
"""

from __future__ import annotations

import asyncio
from datetime import UTC
from typing import Any

import structlog
from taskiq import AsyncBroker

from payload_documents_worker_builder.clients.llama_parse import (
    LlamaParseClient,
    LlamaParseError,
)
from payload_documents_worker_builder.clients.payload import PayloadClient, PayloadError
from payload_documents_worker_builder.config import RuntimeConfig

PARSE_DOCUMENT_TASK_NAME = "documents.parse"

logger = structlog.get_logger("payload_documents_worker_builder.parse_document")


def register_parse_document_task(broker: AsyncBroker, config: RuntimeConfig) -> None:
    """Bind the parse-document task to ``broker``.

    The task is named ``documents.parse``. Kick it from any taskiq client
    (or via the FastAPI HTTP kicker) with a single string arg: the Payload
    document id (numeric ids serialise to string just fine).
    """

    decorator = broker.task(
        task_name=PARSE_DOCUMENT_TASK_NAME,
        retry_on_error=True,
        max_retries=2,
    )

    async def parse_document(document_id: str) -> None:
        await _run_parse_document(document_id, config)

    decorator(parse_document)


async def _run_parse_document(document_id: str, config: RuntimeConfig) -> None:
    """Implementation kept outside the closure for testability."""
    log = logger.bind(document_id=document_id, collection=config.documents_collection_slug)
    log.info("Parse document task started")

    payload_client = PayloadClient(
        base_url=str(config.payload_url),
        api_token=config.payload_service_token.get_secret_value(),
        internal_secret=config.internal_secret.get_secret_value(),
    )
    llama_client = LlamaParseClient(
        api_key=config.llama_cloud_api_key.get_secret_value(),
        base_url=str(config.llama_parse_base_url),
    )

    try:
        await payload_client.submit_parse_result(
            config.documents_collection_slug,
            document_id,
            {"parse_status": "processing", "parse_error": None},
        )

        doc = await payload_client.fetch_parse_context(config.documents_collection_slug, document_id)
        upload_filename = _resolve_filename(doc)

        log.info("Downloading upload from Payload", filename=upload_filename)
        file_bytes = await payload_client.fetch_parse_file(
            config.documents_collection_slug, document_id
        )

        log.info("Uploading to LlamaParse", filename=upload_filename, size=len(file_bytes))
        job = await llama_client.upload(
            file_bytes=file_bytes,
            filename=upload_filename,
            language=doc.get("language"),
            parsing_instruction=doc.get("parsing_instruction"),
            mode=doc.get("mode"),
        )
        log.info("LlamaParse job created", llama_job_id=job.id)

        await payload_client.submit_parse_result(
            config.documents_collection_slug,
            document_id,
            {"parse_job_id": job.id, "parse_status": "processing"},
        )

        markdown = await _poll_until_done(llama_client, job.id, config, log)
        log.info("Parse complete; writing back to Payload", chars=len(markdown))

        await payload_client.submit_parse_result(
            config.documents_collection_slug,
            document_id,
            {
                "parsed_text": markdown,
                "parse_status": "done",
                "parse_error": None,
                "parsed_at": _now_iso(),
            },
        )
        log.info("Parse document task succeeded")
    except (LlamaParseError, PayloadError) as exc:
        log.exception("Parse document task failed")
        await _stamp_error(payload_client, config, document_id, str(exc))
        raise
    except Exception as exc:  # pragma: no cover — unexpected errors still surface
        log.exception("Parse document task crashed unexpectedly")
        await _stamp_error(payload_client, config, document_id, str(exc))
        raise


async def _poll_until_done(
    client: LlamaParseClient,
    job_id: str,
    config: RuntimeConfig,
    log: structlog.stdlib.BoundLogger,
) -> str:
    elapsed = 0.0
    while elapsed <= config.llama_parse_poll_timeout_s:
        job = await client.status(job_id)
        if job.status == "SUCCESS":
            return await client.fetch_markdown(job_id)
        if job.status in ("ERROR", "CANCELLED"):
            raise LlamaParseError(
                f"LlamaParse job {job_id} ended in {job.status}: {job.error or 'no detail'}"
            )
        log.debug("Polling LlamaParse", status=job.status, elapsed_s=elapsed)
        await asyncio.sleep(config.llama_parse_poll_interval_s)
        elapsed += config.llama_parse_poll_interval_s
    raise LlamaParseError(
        f"LlamaParse job {job_id} timed out after {config.llama_parse_poll_timeout_s}s"
    )


def _resolve_filename(doc: dict[str, Any]) -> str:
    """Pick a filename to send to LlamaParse.

    LlamaParse only cares about the file extension, so any string Payload gave
    us is fine. Fall back to a generic name if the parse-context projection
    didn't include one.
    """
    filename = doc.get("filename")
    if isinstance(filename, str) and filename:
        return filename
    return "upload.bin"


async def _stamp_error(
    client: PayloadClient,
    config: RuntimeConfig,
    document_id: str,
    message: str,
) -> None:
    """Best-effort error stamp — never raises so we don't shadow the original exception."""
    try:
        await client.submit_parse_result(
            config.documents_collection_slug,
            document_id,
            {"parse_status": "error", "parse_error": message[:500]},
        )
    except Exception:
        logger.exception("Failed to stamp parse_error on document", document_id=document_id)


def _now_iso() -> str:
    from datetime import datetime

    return datetime.now(UTC).isoformat()
