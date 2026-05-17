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
import contextlib
from datetime import UTC, datetime

import httpx
import structlog
from taskiq import AsyncBroker

from payload_documents_worker_builder.clients.llama_parse import (
    LlamaParseClient,
    LlamaParseError,
    LlamaParseJob,
)
from payload_documents_worker_builder.clients.payload import PayloadClient, PayloadError
from payload_documents_worker_builder.clients.types import ParseContext
from payload_documents_worker_builder.config import RuntimeConfig

PARSE_DOCUMENT_TASK_NAME = "documents.parse"
DEFAULT_FILENAME = "upload.bin"

# Defensive limits before we ship a file to LlamaParse. A single 1GB upload
# in Payload (or many MB-sized files in a tight loop) can rack up significant
# LlamaParse cost. Mirrors the limit in apps/server/src/collections/Documents
# (kept conservative for now; raise via config if needed). Security audit: M6.
MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024  # 100 MiB
ALLOWED_MIME_PREFIXES = (
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument",
    "text/",
    "image/",
)


class FileTooLargeError(Exception):
    """Raised when a Payload upload exceeds MAX_FILE_SIZE_BYTES."""


class UnsupportedMimeTypeError(Exception):
    """Raised when the upload's MIME type isn't on the allowlist."""


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
    """Orchestrator: each phase is its own coroutine for unit-testability."""
    log = logger.bind(document_id=document_id, collection=config.documents_collection_slug)
    log.info("Parse document task started")

    async with (
        PayloadClient(
            base_url=str(config.payload_url),
            internal_secret=config.internal_secret.get_secret_value(),
        ) as payload,
        LlamaParseClient(
            api_key=config.llama_cloud_api_key.get_secret_value(),
            base_url=str(config.llama_parse_base_url),
        ) as llama,
    ):
        try:
            await _mark_processing(payload, config, document_id)
            ctx, file_bytes = await _fetch_inputs(payload, config, document_id, log)
            job = await _submit_to_llama(llama, ctx, file_bytes, log)
            await _record_job_id(payload, config, document_id, job)
            markdown = await _poll_until_done(llama, job.id, config, log)
            await _writeback_success(payload, config, document_id, markdown, log)
            log.info("Parse document task succeeded")
        except (
            LlamaParseError,
            PayloadError,
            FileTooLargeError,
            UnsupportedMimeTypeError,
        ) as exc:
            log.exception("Parse document task failed")
            await _stamp_error(payload, config, document_id, str(exc))
            raise


async def _mark_processing(payload: PayloadClient, config: RuntimeConfig, document_id: str) -> None:
    await payload.submit_parse_result(
        config.documents_collection_slug,
        document_id,
        {"parse_status": "processing", "parse_error": None},
    )


async def _fetch_inputs(
    payload: PayloadClient,
    config: RuntimeConfig,
    document_id: str,
    log: structlog.stdlib.BoundLogger,
) -> tuple[ParseContext, bytes]:
    ctx = await payload.fetch_parse_context(config.documents_collection_slug, document_id)

    # Validate MIME type before pulling bytes — a quota-abuse attempt with a
    # huge non-document file can be rejected without ever downloading.
    mime_type = ctx.get("mimeType") or ctx.get("mime_type")
    if mime_type and not any(mime_type.startswith(p) for p in ALLOWED_MIME_PREFIXES):
        log.warning("Rejecting upload with unsupported MIME", mime_type=mime_type)
        raise UnsupportedMimeTypeError(
            f"MIME type {mime_type!r} not in allowlist; refusing to send to LlamaParse"
        )

    log.info("Downloading upload from Payload", filename=_resolve_filename(ctx))
    file_bytes = await payload.fetch_parse_file(config.documents_collection_slug, document_id)

    # Size-cap after download so we have actual bytes (Payload may not always
    # populate filesize in the metadata depending on storage adapter).
    if len(file_bytes) > MAX_FILE_SIZE_BYTES:
        log.warning(
            "Rejecting upload over size limit",
            size=len(file_bytes),
            limit=MAX_FILE_SIZE_BYTES,
        )
        raise FileTooLargeError(
            f"File size {len(file_bytes)} bytes exceeds limit {MAX_FILE_SIZE_BYTES}; "
            "refusing to send to LlamaParse"
        )

    return ctx, file_bytes


async def _submit_to_llama(
    llama: LlamaParseClient,
    ctx: ParseContext,
    file_bytes: bytes,
    log: structlog.stdlib.BoundLogger,
) -> LlamaParseJob:
    filename = _resolve_filename(ctx)
    log.info("Uploading to LlamaParse", filename=filename, size=len(file_bytes))
    job = await llama.upload(
        file_bytes=file_bytes,
        filename=filename,
        language=ctx.get("language"),
        parsing_instruction=ctx.get("parsing_instruction"),
        mode=ctx.get("mode"),
    )
    log.info("LlamaParse job created", llama_job_id=job.id)
    return job


async def _record_job_id(
    payload: PayloadClient, config: RuntimeConfig, document_id: str, job: LlamaParseJob
) -> None:
    await payload.submit_parse_result(
        config.documents_collection_slug,
        document_id,
        {"parse_job_id": job.id},
    )


async def _writeback_success(
    payload: PayloadClient,
    config: RuntimeConfig,
    document_id: str,
    markdown: str,
    log: structlog.stdlib.BoundLogger,
) -> None:
    log.info("Parse complete; writing back to Payload", chars=len(markdown))
    await payload.submit_parse_result(
        config.documents_collection_slug,
        document_id,
        {
            "parsed_text": markdown,
            "parse_status": "done",
            "parse_error": None,
            "parsed_at": _now_iso(),
        },
    )


async def _poll_until_done(
    client: LlamaParseClient,
    job_id: str,
    config: RuntimeConfig,
    log: structlog.stdlib.BoundLogger,
) -> str:
    deadline = asyncio.get_event_loop().time() + config.llama_parse_poll_timeout_s
    while asyncio.get_event_loop().time() <= deadline:
        job = await client.status(job_id)
        if job.status == "SUCCESS":
            return await client.fetch_markdown(job_id)
        if job.status in ("ERROR", "CANCELLED"):
            raise LlamaParseError(
                f"LlamaParse job {job_id} ended in {job.status}: {job.error or 'no detail'}"
            )
        log.debug("Polling LlamaParse", status=job.status)
        await asyncio.sleep(config.llama_parse_poll_interval_s)
    raise LlamaParseError(
        f"LlamaParse job {job_id} timed out after {config.llama_parse_poll_timeout_s}s"
    )


def _resolve_filename(ctx: ParseContext) -> str:
    filename = ctx.get("filename")
    return filename if isinstance(filename, str) and filename else DEFAULT_FILENAME


async def _stamp_error(
    payload: PayloadClient, config: RuntimeConfig, document_id: str, message: str
) -> None:
    """Best-effort error stamp — never raises so we don't shadow the original exception."""
    with contextlib.suppress(PayloadError, httpx.HTTPError):
        await payload.submit_parse_result(
            config.documents_collection_slug,
            document_id,
            {"parse_status": "error", "parse_error": message[:500]},
        )


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()
